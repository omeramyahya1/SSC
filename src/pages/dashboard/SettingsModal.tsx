import { useNavigate } from "react-router-dom";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useUserStore } from "@/store/useUserStore";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HoldToConfirmButton } from "@/components/ui/HoldToConfirmButton";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSystemInfoStore } from "@/store/useSystemInfoStore";
import { User, Shield, Database, LogOut, Trash2, Save, Pencil, X, Mail, KeyRound, ChevronsUpDown, Check, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import api from "@/api/client";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Import CSV raw
import geoDataCsv from '@/assets/dataset/geo_data.csv?raw';


// --- Helper Functions & Utilities ---
const parseCsv = (csv: string) => {
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const currentLine = lines[i].split(',');
        const obj: any = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j].trim()] = currentLine[j]?.trim();
        }
        data.push(obj);
    }
    return data;
};

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.replace(
    /\w\S*/g,
    text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
};

// --- Custom Searchable Select (Copied from registration.tsx) ---
const SearchableSelect = ({ items, value, onValueChange, placeholder, disabled }: any) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false)

    const selectedLabel = items.find((item: any) => item.value === value)?.label

    return (
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
                "w-full justify-between px-4 py-3 h-12 border border-neutral/20 shadow-sm rounded-base focus:shadow-md focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40",
                !value && "text-muted-foreground",
                disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={disabled}
            >
            {value ? selectedLabel : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white rounded-lg">
            <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
                <CommandEmpty>{t('registration.search.no_results', 'No results found.')}</CommandEmpty>
                <CommandGroup>
                {items.map((item: any) => (
                    <CommandItem
                    key={item.value}
                    value={item.label} // Search by label
                    className='hover:bg-primary-gray rounded-lg cursor-pointer'
                    onSelect={(currentValue) => {
                        // We need the value, not the label
                        // But cmdk uses label as value often if not specified
                        // Here we map back
                        const original = items.find((i: any) => i.label.toLowerCase() === currentValue.toLowerCase()) || items.find((i:any) => i.label === currentValue);
                        onValueChange(original?.value || currentValue)
                        setOpen(false)
                    }}
                    >
                    <Check
                        className={cn(
                        "mr-2 h-4 w-4",
                        value === item.value ? "opacity-100" : "opacity-0"
                        )}
                    />
                    {item.label}
                    </CommandItem>
                ))}
                </CommandGroup>
            </CommandList>
            </Command>
        </PopoverContent>
        </Popover>
    )
}


export function SettingsModal() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { currentUser, updateUser, deleteUser, changeCurrentUserEmail, checkEmailUniqueness, setCurrentUser } = useUserStore();
    const { setCurrentAuthentication, logout, changePassword } = useAuthenticationStore();
    const { systemInfo, isLoading: isSystemInfoLoading, fetchSystemInfo } = useSystemInfoStore();

    const isEmployee = currentUser?.role === "employee";
    const isEnterprise = currentUser ? currentUser.account_type !== "standard" : false;
    const canEditOrganizationProfile = Boolean(currentUser) && !isEmployee;

    // Local Constants for Password/Email Validation (Copied from registration.tsx)
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const PASSWORD_MIN_LENGTH = 6;

    // Personal profile edit state
    const [isEditingPersonal, setIsEditingPersonal] = useState(false);
    const [personalDraft, setPersonalDraft] = useState({
        username: currentUser?.username || "",
        locationState: currentUser?.location?.split(', ')[1] || "", // Extract state
        locationCity: currentUser?.location?.split(', ')[0] || "", // Extract city
    });
    const [usernameError, setUsernameError] = useState<string | null>(null);

    // Organization profile edit state
    const [isEditingOrganization, setIsEditingOrganization] = useState(false);
    const [organizationDraft, setOrganizationDraft] = useState({
        business_name: currentUser?.business_name || "",
    });

    // Security: email state
    const [newEmail, setNewEmail] = useState("");
    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
    const [isCheckingEmail, setIsCheckingEmail] = useState(false);
    const [emailValidationError, setEmailValidationError] = useState<string | null>(null); // New state for email validation

    // Security: password state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false); // New state for password visibility
    const [newPasswordError, setNewPasswordError] = useState<string | null>(null); // New state for new password validation
    const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null); // New state for confirm password validation

    // Deactivation confirm dialog
    const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
    const [deactivatePassword, setDeactivatePassword] = useState("");
    const [isDeactivatePasswordVerified, setIsDeactivatePasswordVerified] = useState(false);
    const [isVerifyingDeactivatePassword, setIsVerifyingDeactivatePassword] = useState(false);

    const [isSavingPersonal, setIsSavingPersonal] = useState(false);
    const [isSavingOrganization, setIsSavingOrganization] = useState(false);
    const [activeTab, setActiveTab] = useState("profile"); // New state for active tab

    // --- Location Data (Copied from registration.tsx) ---
    const geoDataParsed = useMemo(() => parseCsv(geoDataCsv), []);
    const uniqueStates = useMemo(() => Array.from(new Set(geoDataParsed.map(item => item.state))).map(stateName => {
        const entry = geoDataParsed.find(item => item.state === stateName);
        return {
            value: entry.state,
            label_en: toTitleCase(entry.state),
            label_ar: entry.state_ar
        };
    }), [geoDataParsed]);

    const cities = useMemo(() => {
        const state = personalDraft.locationState;
        if (state) {
            return geoDataParsed.filter(item => item.state === state).map(item => ({
                value: item.city,
                label_en: toTitleCase(item.city),
                label_ar: item.city_ar,
                latitude: item.latitude,
                longitude: item.longitude
            }));
        }
        return [];
    }, [personalDraft.locationState, geoDataParsed]);

    useEffect(() => {
        if (currentUser) {
            if (!isEditingPersonal) {
                setPersonalDraft({
                    username: currentUser.username || "",
                    locationState: currentUser.location?.split(', ')[1] || "",
                    locationCity: currentUser.location?.split(', ')[0] || "",
                });
            }
            if (!isEditingOrganization) {
                setOrganizationDraft({
                    business_name: currentUser.business_name || "",
                });
            }
            setNewEmail("");
            setEmailValidationError(null); // Reset email validation error on user change
            setNewPasswordError(null);
            setConfirmPasswordError(null);
            setUsernameError(null);
        }
        setEmailAvailable(null);
    }, [currentUser, isEditingPersonal, isEditingOrganization]);

    useEffect(() => {
        fetchSystemInfo();
    }, [fetchSystemInfo]);

    const handleSavePersonalProfile = async () => {
        if (!currentUser) return;
        if (!navigator.onLine) {
            toast.error(t('settings.internet_required_save', 'Internet connection required to save changes'));
            return;
        }

        // Username validation
        if (personalDraft.username.trim() === '') {
            setUsernameError(t('settings.username_required', 'Username is required.'));
            return;
        } else {
            setUsernameError(null);
        }

        setIsSavingPersonal(true);
        try {
            const locationString = personalDraft.locationCity && personalDraft.locationState
                ? `${personalDraft.locationCity}, ${personalDraft.locationState}`
                : "";

            await updateUser(currentUser.user_id, {
                username: personalDraft.username,
                location: isEmployee ? currentUser.location : locationString // Only update if not employee
            });
            setIsEditingPersonal(false);
            toast.success(t('settings.profile_updated', 'Profile updated successfully'));
        } catch (error) {
            toast.error(t('settings.update_failed', 'Failed to update profile'));
        } finally {
            setIsSavingPersonal(false);
        }
    };

    const handleCancelPersonalProfile = () => {
        if (!currentUser) return;
        setIsEditingPersonal(false);
        setPersonalDraft({
            username: currentUser.username || "",
            locationState: currentUser.location?.split(', ')[1] || "",
            locationCity: currentUser.location?.split(', ')[0] || "",
        });
        setUsernameError(null); // Clear errors on cancel
    };

    const handleSaveOrganizationProfile = async () => {
        if (!currentUser) return;
        if (!navigator.onLine) {
            toast.error(t('settings.internet_required_save', 'Internet connection required to save changes'));
            return;
        }
        setIsSavingOrganization(true);
        try {
            await updateUser(currentUser.user_id, {
                business_name: organizationDraft.business_name,
            });
            setIsEditingOrganization(false);
            toast.success(t('settings.profile_updated', 'Profile updated successfully'));
        } catch (error) {
            toast.error(t('settings.update_failed', 'Failed to update settings'));
        } finally {
            setIsSavingOrganization(false);
        }
    };

    const handleCancelOrganizationProfile = () => {
        if (!currentUser) return;
        setIsEditingOrganization(false);
        setOrganizationDraft({
            business_name: currentUser.business_name || "",
        });
    };

    const handleLogout = async () => {
        await logout();
        setCurrentUser(null);
        setCurrentAuthentication(null);
        localStorage.removeItem('access_token');
        navigate("/");
    };

    const handleLanguageChange = (lang: string) => {
        i18n.changeLanguage(lang);
    };

    // --- Password Validation Logic ---
    useEffect(() => {
        setNewPasswordError(null);
        setConfirmPasswordError(null);

        if (newPassword.length > 0 && newPassword.length < PASSWORD_MIN_LENGTH) {
            setNewPasswordError(t('registration.password_hint', 'Min 6 chars, at least 1 number'));
        } else if (newPassword.length > 0 && !(/\d/).test(newPassword)) {
            setNewPasswordError(t('registration.password_hint_number', 'Password must contain at least one number.'));
        }

        if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
            setConfirmPasswordError(t('registration.passwords_mismatch', 'Passwords do not match.'));
        }
    }, [newPassword, confirmPassword, t]);

    const handlePasswordChange = async () => {
        if (!navigator.onLine) {
            toast.error(t('settings.internet_required_change', 'Internet connection required to change sensitive settings'));
            return;
        }
        // Additional validation before API call
        if (newPasswordError || confirmPasswordError || !currentPassword || !newPassword || !confirmPassword) {
            toast.error(t('settings.password_validation_error', 'Please ensure all password fields are valid.'));
            return;
        }

        try {
            await changePassword(currentPassword, newPassword);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast.success(t('settings.password_updated', 'Password updated successfully'));
        } catch (e: any) {
            toast.error(e?.message || t('settings.update_failed', 'Failed to update settings'));
        }
    };

    // --- Email Validation Logic (Debounced) ---
    useEffect(() => {
        setEmailAvailable(null);
        setEmailValidationError(null);

        const email = newEmail.trim().toLowerCase();
        if (!email) {
            return;
        }

        if (!EMAIL_REGEX.test(email)) {
            setEmailValidationError(t('registration.invalid_email', 'Email is invalid'));
            return;
        }

        setIsCheckingEmail(true);
        const timer = setTimeout(async () => {
            try {
                const isUnique = await checkEmailUniqueness(email);
                setEmailAvailable(isUnique);
                if (!isUnique) {
                    setEmailValidationError(t('registration.email_taken', 'Email is already in use'));
                }
            } catch (error) {
                console.error("Error checking email uniqueness:", error);
                setEmailAvailable(false); // Assume not available on error for safety
                setEmailValidationError(t('settings.email_check_failed', 'Failed to verify email availability.'));
            } finally {
                setIsCheckingEmail(false);
            }
        }, 500); // Debounce time

        return () => clearTimeout(timer);
    }, [newEmail, checkEmailUniqueness, t]);

    const handleUpdateEmail = async () => {
        if (!currentUser) return;
        if (!navigator.onLine) {
            toast.error(t('team.internet_required', 'Active internet connection required for this action'));
            return;
        }
        if (emailValidationError || emailAvailable === false || !newEmail.trim()) {
            toast.error(t('settings.email_validation_error', 'Please provide a valid and available email.'));
            return;
        }
        try {
            await changeCurrentUserEmail(newEmail);
            setEmailAvailable(true); // Should be true if update successful
            setEmailValidationError(null);
            toast.success(t('settings.email_updated', 'Email updated successfully'));
        } catch (e: any) {
            toast.error(e?.message || t('settings.update_failed', 'Failed to update settings'));
        }
    };

    const handleDeactivateAccount = async () => {
        if (!currentUser) return;
        if (!navigator.onLine) {
            toast.error(t('team.internet_required', 'Active internet connection required for this action'));
            return;
        }
        try {
            await deleteUser(currentUser.uuid, deactivatePassword);
            await handleLogout();
        } catch (e) {
            toast.error(t('settings.deactivate_failed', 'Failed to deactivate account'));
        }
    };

    const handleVerifyDeactivatePassword = async (): Promise<boolean | undefined> => {
        if (!deactivatePassword.trim()) return;
        setIsVerifyingDeactivatePassword(true);
        try {
            await api.post("/authentications/verify-password", { password: deactivatePassword });
            setIsDeactivatePasswordVerified(true);
            toast.success(t('settings.password_verified', 'Password verified'));
            return true;
        } catch (e: any) {
            setIsDeactivatePasswordVerified(false);
            const msg = t('settings.invalid_password', 'Invalid password');
            toast.error(msg);
            return false;
        } finally {
            setIsVerifyingDeactivatePassword(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, i);
        return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
    };

    const formatRelativeTime = (iso: string | null) => {
        if (!iso) return t('settings.never', 'Never');
        const dt = new Date(iso);
        const diff = Date.now() - dt.getTime();
        if (!Number.isFinite(diff)) return iso;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return t('settings.just_now', 'Just now');
        if (minutes < 60) return t('settings.minutes_ago', '{{count}} mins ago', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('settings.hours_ago', '{{count}} hrs ago', { count: hours });
        const days = Math.floor(hours / 24);
        return t('settings.days_ago', '{{count}} days ago', { count: days });
    };

    return (
        <DialogContent className="w-[85vw] max-w-4xl h-[85vh] p-0 pb-2 overflow-hidden bg-white border-none rounded-3xl shadow-2xl flex flex-col" dir={i18n.dir()}>
            <DialogHeader className="p-8 pb-4 bg-gray-50/50">
                <DialogTitle className="text-3xl font-black">{t('dashboard.settings', 'Settings')}</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="profile" value={activeTab} onValueChange={(value) => {
                setActiveTab(value);
                // Reset edit modes when switching tabs
                setIsEditingPersonal(false);
                setIsEditingOrganization(false);
            }} className="flex flex-1 h-full pb-2 overflow-y-auto overscroll-none" orientation="vertical" dir={i18n.dir()}>
                <TabsList className="flex flex-col w-64 bg-gray-100 p-4 gap-2 h-full border-[1px] border-primary-gray justify-start rounded-xl m-2" dir={i18n.dir()}>
                    <TabsTrigger value="profile" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all font-bold">
                        <User className="w-4 h-4" /> {t('settings.profile', 'Profile')}
                    </TabsTrigger>
                    <TabsTrigger value="security" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all font-bold">
                        <Shield className="w-4 h-4" /> {t('settings.security', 'Security')}
                    </TabsTrigger>
                    <TabsTrigger value="system" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm transition-all font-bold">
                        <Database className="w-4 h-4" /> {t('settings.system', 'System')}
                    </TabsTrigger>
                    <div className="mt-auto pt-4 w-full">
                        <Button onClick={handleLogout} className="w-full justify-start px-4 py-3 rounded-lg bg-white text-red-700 hover:text-white hover:bg-red-500 font-bold gap-2 transition-colors">
                            <LogOut className="w-4 h-4" />
                            <span>{t('dashboard.logout', 'Logout')}</span>
                        </Button>
                    </div>
                </TabsList>

                <div className="flex-1 overflow-hidden" dir={i18n.dir()}>
                    <ScrollArea className="h-full" dir={i18n.dir()}>
                        <div className="p-8 space-y-8">

                            <TabsContent value="profile" className="m-0 space-y-6">
                                <div className="flex items-center gap-6 pb-4">
                                    <div className="relative group">
                                        <Avatar className="w-24 h-24 border-2 border-primary shadow-xl">
                                            <AvatarImage src={currentUser?.business_logo} />
                                            <AvatarFallback className="bg-primary/10 text-primary text-3xl font-black">
                                                {currentUser?.username?.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-neutral/80">{currentUser?.username}</h3>
                                        <p className="text-sm font-bold text-neutral/40 uppercase">
                                            {currentUser?.account_type} {t('registration.emp_short', 'Account')}
                                            {isEnterprise ? ` • ${currentUser?.role}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-1 gap-6">
                                    <div className="relative border border-gray-100 bg-white rounded-2xl p-6">
                                        {(() => {
                                            const isReadOnly = false;
                                            const issued = false;
                                            return (
                                                !isReadOnly && (
                                                    <div className="absolute top-4 end-4">
                                                        {isEditingPersonal ? (
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={handleSavePersonalProfile}
                                                                    disabled={isSavingPersonal || !!usernameError}
                                                                    className="h-7 w-7 text-green-600 hover:text-green-700"
                                                                >
                                                                    <Save className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={handleCancelPersonalProfile}
                                                                    className="h-7 w-7 text-red-600 hover:text-red-700"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ) : !issued && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => {
                                                                    if (!navigator.onLine) {
                                                                        toast.error(t('settings.internet_required_edit', 'Internet connection required to edit settings'));
                                                                        return;
                                                                    }
                                                                    setIsEditingPersonal(true);
                                                                }}
                                                                className="h-7 w-7"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )
                                            );
                                        })()}

                                        <h4 className="text-sm font-black text-neutral/80 uppercase tracking-wider">
                                            {t('settings.personal_profile', 'Personal Profile')}
                                        </h4>
                                        <div className="mt-4 flex flex-col md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.username', 'Username')}</Label>
                                                {isEditingPersonal ? (
                                                    <>
                                                        <Input
                                                            value={personalDraft.username}
                                                            onChange={(e) => {
                                                                setPersonalDraft((p) => ({ ...p, username: e.target.value }));
                                                                if (e.target.value.trim() === '') {
                                                                    setUsernameError(t('settings.username_required', 'Username is required.'));
                                                                } else {
                                                                    setUsernameError(null);
                                                                }
                                                            }}
                                                            className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium"
                                                        />
                                                        {usernameError && (
                                                            <p className="text-xs text-red-500 mt-1 ps-1 flex items-center gap-1">
                                                                {usernameError}
                                                            </p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="h-12 flex items-center font-bold text-neutral/80">{currentUser?.username || "—"}</p>
                                                )}
                                            </div>



                                            <div className="flex flex-row gap-6">
                                                <div className="space-y-2 w-1/2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.state', 'State')}</Label>
                                                {isEditingPersonal ? (
                                                    <SearchableSelect
                                                        items={uniqueStates.map(s => ({ value: s.value, label: i18n.language === 'ar' ? s.label_ar : s.label_en }))}
                                                        value={personalDraft.locationState}
                                                        onValueChange={(val: string) => setPersonalDraft((p) => ({ ...p, locationState: val, locationCity: '' }))}
                                                        placeholder={t('registration.select_state', 'Select state')}
                                                        disabled={isEmployee}
                                                    />
                                                ) : (
                                                    <p className="h-12 flex items-center font-bold text-neutral/80">{currentUser?.location?.split(', ')[1] || "—"}</p>
                                                )}
                                                {isEmployee && (
                                                    <p className="text-[10px] text-semantic-warning font-bold uppercase">
                                                        {t('settings.employee_location_locked', 'Employees cannot edit location')}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2 w-1/2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.city', 'City')}</Label>
                                                {isEditingPersonal ? (
                                                    <SearchableSelect
                                                        items={cities.map(c => ({ value: c.value, label: i18n.language === 'ar' ? c.label_ar : c.label_en }))}
                                                        value={personalDraft.locationCity}
                                                        onValueChange={(val: string) => setPersonalDraft((p) => ({ ...p, locationCity: val }))}
                                                        placeholder={t('registration.select_city', 'Select city')}
                                                        disabled={isEmployee || !personalDraft.locationState}
                                                    />
                                                ) : (
                                                    <p className="h-12 flex items-center font-bold text-neutral/80">{currentUser?.location?.split(', ')[0] || "—"}</p>
                                                )}
                                            </div>
                                            </div>




                                        </div>
                                    </div>

                                    <div className="relative border border-gray-100 bg-white rounded-2xl p-6">
                                        {(() => {
                                            const isReadOnly = !canEditOrganizationProfile;
                                            const issued = false;
                                            return (
                                                !isReadOnly && (
                                                    <div className="absolute top-4 end-4">
                                                        {isEditingOrganization ? (
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={handleSaveOrganizationProfile}
                                                                    disabled={isSavingOrganization}
                                                                    className="h-7 w-7 text-green-600 hover:text-green-700"
                                                                >
                                                                    <Save className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={handleCancelOrganizationProfile}
                                                                    className="h-7 w-7 text-red-600 hover:text-red-700"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ) : !issued && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => {
                                                                    if (!navigator.onLine) {
                                                                        toast.error(t('settings.internet_required_edit', 'Internet connection required to edit settings'));
                                                                        return;
                                                                    }
                                                                    setIsEditingOrganization(true);
                                                                }}
                                                                className="h-7 w-7"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )
                                            );
                                        })()}

                                        <h4 className="text-sm font-black text-neutral/80 uppercase tracking-wider">
                                            {t('settings.organization_profile', 'Organization Profile')}
                                        </h4>
                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.business_name', 'Business Name')}</Label>
                                                {isEditingOrganization ? (
                                                    <Input
                                                        value={organizationDraft.business_name}
                                                        onChange={(e) => setOrganizationDraft((p) => ({ ...p, business_name: e.target.value }))}
                                                        className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium"
                                                    />
                                                ) : (
                                                    <p className="h-12 flex items-center font-bold text-neutral/80">{currentUser?.business_name || "—"}</p>
                                                )}
                                                {isEnterprise && isEmployee && (
                                                    <p className="text-[10px] text-neutral/40 font-bold uppercase">
                                                        {t('settings.employee_org_locked', 'Only admins can edit organization profile')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="security" className="m-0 space-y-6">
                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-neutral/80 uppercase tracking-wider">{t('settings.change_password', 'Change Password')}</h4>
                                    <div className="space-y-4 max-w-sm">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-neutral/40 uppercase">{t('auth.current_password', 'Current Password')}</Label>
                                            <div className="relative">
                                                <Input type={showPassword ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium" />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="w-4 h-4 opacity-70" />
                                                    ) : (
                                                        <Eye className="w-4 h-4 opacity-70" />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-neutral/40 uppercase">{t('auth.new_password', 'New Password')}</Label>
                                            <div className="relative">
                                                <Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium" />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="w-4 h-4 opacity-70" />
                                                    ) : (
                                                        <Eye className="w-4 h-4 opacity-70" />
                                                    )}
                                                </button>
                                            </div>
                                            {newPasswordError && (
                                                <p className="text-xs text-red-500 mt-1 ps-1 flex items-center gap-1">
                                                    {newPasswordError}
                                                </p>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.confirm_password', 'Confirm Password')}</Label>
                                            <div className="relative">
                                                <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium" />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="w-4 h-4 opacity-70" />
                                                    ) : (
                                                        <Eye className="w-4 h-4 opacity-70" />
                                                    )}
                                                </button>
                                            </div>
                                            {confirmPasswordError && (
                                                <p className="text-xs text-red-500 mt-1 ps-1 flex items-center gap-1">
                                                    {confirmPasswordError}
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            onClick={handlePasswordChange}
                                            disabled={!!newPasswordError || !!confirmPasswordError || !currentPassword || !newPassword || !confirmPassword}
                                            className="w-full h-12 rounded-xl font-bold gap-2"
                                        >
                                            <KeyRound className="w-4 h-4" /> {t('auth.change_password_now', 'Update Password')}
                                        </Button>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-neutral/80 uppercase tracking-wider">{t('settings.change_email', 'Change Email')}</h4>
                                    <div className="space-y-4 max-w-sm">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.email', 'Email')}</Label>
                                            <div className="relative">
                                                <Input
                                                    type="email"
                                                    value={newEmail}
                                                    onChange={(e) => {
                                                        setNewEmail(e.target.value);
                                                    }}
                                                    className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium"
                                                />

                                                    <Mail className="w-4 h-4 absolute end-4 top-1/2 -translate-y-1/2 text-neutral/50" />

                                            </div>
                                            {emailValidationError && (
                                                <p className="text-xs text-red-500 mt-1 ps-1 flex items-center gap-1">
                                                    {emailValidationError}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleUpdateEmail}
                                                disabled={isCheckingEmail || !!emailValidationError || emailAvailable === false || !newEmail.trim()}
                                                className="h-12 rounded-xl font-bold flex-1 gap-2"
                                            >
                                                <Save className="w-4 h-4" /> {t('settings.update_email', 'Update')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {!isEmployee && (
                                    <>
                                        <Separator />
                                        <div className="space-y-4">
                                            <h4 className="text-sm font-black text-red-500 uppercase tracking-wider">{t('settings.danger_zone', 'Danger Zone')}</h4>
                                            <div className="p-6 border border-red-100 bg-red-50/30 rounded-2xl space-y-4">
                                                <div className="flex items-start justify-between gap-6">
                                                    <div className="space-y-0.5">
                                                        <Label className="font-bold text-red-600">{t('settings.deactivate', 'Deactivate Account')}</Label>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 max-w-sm">
                                                    <div className="space-y-2">
                                                        <Label className="text-xs font-bold text-neutral/40 uppercase">
                                                            {t('auth.current_password', 'Current Password')}
                                                        </Label>
                                                        <Input
                                                            type="password"
                                                            value={deactivatePassword}
                                                            onChange={(e) => {
                                                                setDeactivatePassword(e.target.value);
                                                                setIsDeactivatePasswordVerified(false);
                                                            }}
                                                            className="bg-gray border-[1px] border-primary-gray rounded-xl h-12 font-medium"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Button
                                                            onClick={async () => {
                                                            if (await handleVerifyDeactivatePassword()) {
                                                                setIsDeactivateOpen(true);
                                                            }
                                                        }}
                                                        variant="outline"
                                                        disabled={isVerifyingDeactivatePassword || !deactivatePassword.trim()}
                                                        className="gap-2 rounded-xl font-bold"
                                                    >
                                                        {
                                                            isDeactivatePasswordVerified ? (
                                                                <div className="flex flex-row gap-2 h-12 items-center">
                                                                    <Trash2 className="w-4 h-4" /> {t('settings.deactivate_button', 'Deactivate')}
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    {t('common.verify', 'Verify')}
                                                                </div>
                                                            )
                                                        }

                                                        </Button>
                                                        {isDeactivatePasswordVerified && (
                                                            <p className="text-[10px] font-bold uppercase text-green-600">
                                                                {t('settings.verified', 'Verified')}
                                                            </p>
                                                        )}
                                                        {!isDeactivatePasswordVerified && !!deactivatePassword.trim() && (
                                                            <p className="text-[10px] font-bold uppercase text-red-500">
                                                                {t('settings.verify_required', 'Verify required')}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <AlertDialog open={isDeactivateOpen} onOpenChange={setIsDeactivateOpen}>
                                                <AlertDialogContent className="bg-white">
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>{t('settings.confirm_deactivate_title', 'Deactivate Account?')}</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            {t('settings.confirm_deactivate_desc', 'This will disable access and cascade deactivation to all related data. This action is non-recoverable.')}
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter className="gap-2">
                                                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                                                        <HoldToConfirmButton
                                                            onConfirm={handleDeactivateAccount}
                                                            variant="destructive"
                                                            className="w-auto px-8"
                                                            confirmationLabel={t('common.confirming', 'Confirming...')}
                                                            disabled={!isDeactivatePasswordVerified || isVerifyingDeactivatePassword}
                                                        >
                                                            {t('team.hold_to_deactivate', 'Hold to Deactivate')}
                                                        </HoldToConfirmButton>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </>
                                )}
                            </TabsContent>

                            <TabsContent value="system" className="m-0 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="border-[1px] border-primary-gray bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.app_version', 'App Version')}</p>
                                        <p className="text-2xl font-black text-neutral/80">
                                            {isSystemInfoLoading ? t('common.loading', 'Loading...') : (systemInfo?.app_version || "—")}
                                        </p>
                                    </Card>
                                    <Card className="border-[1px] border-primary-gray bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.db_size', 'Local DB Size')}</p>
                                        <p className="text-2xl font-black text-neutral/80">
                                            {isSystemInfoLoading ? t('common.loading', 'Loading...') : formatBytes(systemInfo?.local_db_size_bytes ?? 0)}
                                        </p>
                                    </Card>
                                    <Card className="border-[1px] border-primary-gray bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.last_sync', 'Last Sync')}</p>
                                        <p className="text-lg font-black text-neutral/80">
                                            {isSystemInfoLoading ? t('common.loading', 'Loading...') : formatRelativeTime(systemInfo?.last_sync_utc ?? null)}
                                        </p>
                                    </Card>
                                </div>
                                <div className="space-y-2 w-1/2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.language.placeholder', 'Language')}</Label>
                                                <Select onValueChange={handleLanguageChange} defaultValue={i18n.language} dir={i18n.dir()}>
                                                    <SelectTrigger className="bg-white border-[1px] border-primary-gray rounded-xl h-12 font-medium">
                                                        <SelectValue placeholder={t('settings.select_language_placeholder', 'Select language')} />
                                                    </SelectTrigger>
                                                    <SelectContent dir={i18n.dir()}>
                                                        <SelectItem value='en'>
                                                            {t('registration.language.en', 'English')}
                                                        </SelectItem>
                                                        <SelectItem value='ar'>
                                                            {t('registration.language.ar', 'العربية')}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                            </TabsContent>

                        </div>
                    </ScrollArea>
                </div>
            </Tabs>
        </DialogContent>
    );
}

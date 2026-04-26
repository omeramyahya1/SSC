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
import { User, Shield, Database, LogOut, Trash2, Save, Upload, Pencil, X, Mail, KeyRound, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import api from "@/api/client";

export function SettingsModal() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { currentUser, updateUser, deleteUser, changeCurrentUserEmail, checkEmailUniqueness, setCurrentUser } = useUserStore();
    const { setCurrentAuthentication, logout, changePassword } = useAuthenticationStore();
    const { systemInfo, isLoading: isSystemInfoLoading, fetchSystemInfo } = useSystemInfoStore();

    const isEmployee = currentUser?.role === "employee";
    const isEnterprise = currentUser ? currentUser.account_type !== "standard" : false;
    const canEditOrganizationProfile = Boolean(currentUser) && !isEmployee;

    // Personal profile edit state
    const [isEditingPersonal, setIsEditingPersonal] = useState(false);
    const [personalDraft, setPersonalDraft] = useState({
        username: currentUser?.username || "",
        location: currentUser?.location || "",
    });

    // Organization profile edit state
    const [isEditingOrganization, setIsEditingOrganization] = useState(false);
    const [organizationDraft, setOrganizationDraft] = useState({
        business_name: currentUser?.business_name || "",
    });

    // Security: email state
    const [newEmail, setNewEmail] = useState(currentUser?.email || "");
    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
    const [isCheckingEmail, setIsCheckingEmail] = useState(false);

    // Security: password state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Deactivation confirm dialog
    const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
    const [deactivatePassword, setDeactivatePassword] = useState("");
    const [isDeactivatePasswordVerified, setIsDeactivatePasswordVerified] = useState(false);
    const [isVerifyingDeactivatePassword, setIsVerifyingDeactivatePassword] = useState(false);

    const [isSavingPersonal, setIsSavingPersonal] = useState(false);
    const [isSavingOrganization, setIsSavingOrganization] = useState(false);

    useEffect(() => {
        if (currentUser) {
            if (!isEditingPersonal) {
                setPersonalDraft({
                    username: currentUser.username || "",
                    location: currentUser.location || "",
                });
            }
            if (!isEditingOrganization) {
                setOrganizationDraft({
                    business_name: currentUser.business_name || "",
                });
            }
            setNewEmail(currentUser.email || "");
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
        setIsSavingPersonal(true);
        try {
            await updateUser(currentUser.user_id, {
                username: personalDraft.username,
                location: isEmployee ? currentUser.location : personalDraft.location
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
            location: currentUser.location || "",
        });
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

    const handlePasswordChange = async () => {
        if (!navigator.onLine) {
            toast.error(t('settings.internet_required_change', 'Internet connection required to change sensitive settings'));
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error(t('auth.passwords_mismatch', 'Passwords do not match'));
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

    const handleCheckEmail = async () => {
        const email = newEmail.trim().toLowerCase();
        if (!email) return;
        setIsCheckingEmail(true);
        try {
            const isUnique = await checkEmailUniqueness(email);
            setEmailAvailable(isUnique);
            if (isUnique) {
                toast.success(t('settings.email_available', 'Email is available'));
            } else {
                toast.error(t('settings.email_taken', 'Email is already in use'));
            }
        } catch {
            setEmailAvailable(false);
            toast.error(t('settings.email_check_failed', 'Failed to verify email'));
        } finally {
            setIsCheckingEmail(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (!currentUser) return;
        if (!navigator.onLine) {
            toast.error(t('team.internet_required', 'Active internet connection required for this action'));
            return;
        }
        try {
            await changeCurrentUserEmail(newEmail);
            setEmailAvailable(true);
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

    const handleVerifyDeactivatePassword = async () => {
        if (!deactivatePassword.trim()) return;
        setIsVerifyingDeactivatePassword(true);
        try {
            await api.post("/authentications/verify-password", { password: deactivatePassword });
            setIsDeactivatePasswordVerified(true);
            toast.success(t('settings.password_verified', 'Password verified'));
        } catch (e: any) {
            setIsDeactivatePasswordVerified(false);
            const msg = e?.response?.data?.error || t('settings.invalid_password', 'Invalid password');
            toast.error(msg);
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
        <DialogContent className="w-[85vw] max-w-4xl h-[85vh] p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl flex flex-col" dir={i18n.dir()}>
            <DialogHeader className="p-8 pb-4 bg-gray-50/50">
                <DialogTitle className="text-3xl font-black">{t('dashboard.settings', 'Settings')}</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="profile" className="flex flex-1 overflow-hidden" orientation="vertical">
                <TabsList className="flex flex-col w-64 bg-gray-50/50 p-4 gap-2 h-full border-e border-gray-100 justify-start rounded-none">
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
                        <Button onClick={handleLogout} className="w-full justify-start px-4 py-3 rounded-lg bg-red-100 text-red-700 hover:text-white hover:bg-red-500 font-bold gap-2 transition-colors">
                            <LogOut className="w-4 h-4" />
                            <span>{t('dashboard.logout', 'Logout')}</span>
                        </Button>
                    </div>
                </TabsList>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-8 space-y-8">
                            <Alert className="bg-primary/5 border-primary/20 rounded-2xl">
                                <Globe className="h-4 w-4 text-primary" />
                                <AlertDescription className="text-primary font-bold text-xs uppercase tracking-wide">
                                    {t('settings.sync_requirement', 'Active internet connection required to synchronize settings with your cloud account')}
                                </AlertDescription>
                            </Alert>

                            <TabsContent value="profile" className="m-0 space-y-6">
                                <div className="flex items-center gap-6 pb-4">
                                    <div className="relative group">
                                        <Avatar className="w-24 h-24 border-4 border-white shadow-xl">
                                            <AvatarImage src={currentUser?.business_logo} />
                                            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">
                                                {currentUser?.username?.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <button className="absolute bottom-0 end-0 bg-primary text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Upload className="w-4 h-4" />
                                        </button>
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
                                                                    disabled={isSavingPersonal}
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
                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.username', 'Username')}</Label>
                                                {isEditingPersonal ? (
                                                    <Input
                                                        value={personalDraft.username}
                                                        onChange={(e) => setPersonalDraft((p) => ({ ...p, username: e.target.value }))}
                                                        className="bg-gray-50 border-none rounded-xl h-12 font-medium"
                                                    />
                                                ) : (
                                                    <p className="h-12 flex items-center font-bold text-neutral/80">{currentUser?.username || "—"}</p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('dashboard.city_label', 'City / Location')}</Label>
                                                {isEditingPersonal ? (
                                                    <Input
                                                        value={personalDraft.location}
                                                        onChange={(e) => setPersonalDraft((p) => ({ ...p, location: e.target.value }))}
                                                        disabled={isEmployee}
                                                        className="bg-gray-50 border-none rounded-xl h-12 font-medium"
                                                    />
                                                ) : (
                                                    <p className="h-12 flex items-center font-bold text-neutral/80">{currentUser?.location || "—"}</p>
                                                )}
                                                {isEmployee && (
                                                    <p className="text-[10px] text-semantic-warning font-bold uppercase">
                                                        {t('settings.employee_location_locked', 'Employees cannot edit location')}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.language.placeholder', 'Language')}</Label>
                                                <Select onValueChange={handleLanguageChange} defaultValue={i18n.language} dir={i18n.dir()}>
                                                    <SelectTrigger className="bg-gray-50 border-none rounded-xl h-12 font-medium">
                                                        <SelectValue placeholder={t('settings.select_language_placeholder', 'Select language')} />
                                                    </SelectTrigger>
                                                    <SelectContent dir={i18n.dir()}>
                                                        <SelectItem value="en">{t('registration.language.en', 'English')}</SelectItem>
                                                        <SelectItem value="ar">{t('registration.language.ar', 'العربية')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
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
                                                        className="bg-gray-50 border-none rounded-xl h-12 font-medium"
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
                                            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-neutral/40 uppercase">{t('auth.new_password', 'New Password')}</Label>
                                            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.confirm_password', 'Confirm Password')}</Label>
                                            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                        </div>
                                        <Button onClick={handlePasswordChange} className="w-full h-12 rounded-xl font-bold gap-2">
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
                                            <Input
                                                type="email"
                                                value={newEmail}
                                                onChange={(e) => {
                                                    setNewEmail(e.target.value);
                                                    setEmailAvailable(null);
                                                }}
                                                className="bg-gray-50 border-none rounded-xl h-12 font-medium"
                                            />
                                            {emailAvailable !== null && (
                                                <p className={`text-[10px] font-bold uppercase ${emailAvailable ? "text-green-600" : "text-red-500"}`}>
                                                    {emailAvailable ? t('settings.email_available', 'Email is available') : t('settings.email_taken', 'Email is already in use')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleCheckEmail}
                                                variant="outline"
                                                disabled={isCheckingEmail || !newEmail.trim()}
                                                className="h-12 rounded-xl font-bold flex-1 gap-2"
                                            >
                                                <Mail className="w-4 h-4" /> {t('settings.check_email', 'Check')}
                                            </Button>
                                            <Button
                                                onClick={handleUpdateEmail}
                                                disabled={!newEmail.trim()}
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
                                                        <p className="text-xs text-red-400 font-medium">{t('settings.deactivate_desc', 'Temporarily disable your account and data access.')}</p>
                                                    </div>
                                                    <Button
                                                        onClick={() => setIsDeactivateOpen(true)}
                                                        variant="destructive"
                                                        disabled={!isDeactivatePasswordVerified}
                                                        className="gap-2 rounded-xl font-bold"
                                                    >
                                                        <Trash2 className="w-4 h-4" /> {t('settings.deactivate_button', 'Deactivate')}
                                                    </Button>
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
                                                            className="bg-white border-none rounded-xl h-12 font-medium"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={handleVerifyDeactivatePassword}
                                                            disabled={isVerifyingDeactivatePassword || !deactivatePassword.trim()}
                                                            className="h-10 rounded-xl font-bold"
                                                        >
                                                            {t('common.verify', 'Verify')}
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
                                    <Card className="border-none bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.app_version', 'App Version')}</p>
                                        <p className="text-2xl font-black text-neutral/80">
                                            {isSystemInfoLoading ? t('common.loading', 'Loading...') : (systemInfo?.app_version || "—")}
                                        </p>
                                    </Card>
                                    <Card className="border-none bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.db_size', 'Local DB Size')}</p>
                                        <p className="text-2xl font-black text-neutral/80">
                                            {isSystemInfoLoading ? t('common.loading', 'Loading...') : formatBytes(systemInfo?.local_db_size_bytes ?? 0)}
                                        </p>
                                    </Card>
                                    <Card className="border-none bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.last_sync', 'Last Sync')}</p>
                                        <p className="text-lg font-black text-neutral/80">
                                            {isSystemInfoLoading ? t('common.loading', 'Loading...') : formatRelativeTime(systemInfo?.last_sync_utc ?? null)}
                                        </p>
                                    </Card>
                                </div>

                            </TabsContent>

                        </div>
                    </ScrollArea>
                </div>
            </Tabs>
        </DialogContent>
    );
}

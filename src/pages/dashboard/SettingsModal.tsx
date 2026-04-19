import { useNavigate } from "react-router-dom";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useUserStore } from "@/store/useUserStore";
import { useApplicationSettingsStore } from "@/store/useApplicationSettingsStore";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Shield, Cog, Database, LogOut, Trash2, Save, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Card } from "@/components/ui/card";

export function SettingsModal() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { currentUser, updateUser, setCurrentUser } = useUserStore();
    const { currentAuthentication, setCurrentAuthentication, logout } = useAuthenticationStore();
    const { currentSetting, updateSetting } = useApplicationSettingsStore();

    // Local state for forms
    const [username, setUsername] = useState(currentUser?.username || "");
    const [businessName, setBusinessName] = useState(currentUser?.business_name || "");
    const [location, setLocation] = useState(currentUser?.location || "");

    // Technical state
    const [safetyFactor, setSafetyFactor] = useState(currentSetting?.other_settings?.safety_factor || 1.2);
    const [wiringLoss, setWiringLoss] = useState(currentSetting?.other_settings?.wiring_loss || 3);
    const [dodLimit, setDodLimit] = useState(currentSetting?.other_settings?.dod_limit || 80);
    const [autoBackup, setAutoBackup] = useState(currentSetting?.other_settings?.auto_backup ?? true);

    // Password state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (currentUser) {
            setUsername(currentUser.username);
            setBusinessName(currentUser.business_name || "");
            setLocation(currentUser.location || "");
        }
    }, [currentUser]);

    useEffect(() => {
        if (currentSetting) {
            setSafetyFactor(currentSetting.other_settings?.safety_factor || 1.2);
            setWiringLoss(currentSetting.other_settings?.wiring_loss || 3);
            setDodLimit(currentSetting.other_settings?.dod_limit || 80);
            setAutoBackup(currentSetting.other_settings?.auto_backup ?? true);
        }
    }, [currentSetting]);

    const handleSaveProfile = async () => {
        if (!currentUser) return;
        setIsSaving(true);
        try {
            await updateUser(currentUser.user_id, {
                username,
                business_name: businessName,
                location
            });
            toast.success(t('settings.profile_updated', 'Profile updated successfully'));
        } catch (error) {
            toast.error(t('settings.update_failed', 'Failed to update profile'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveTechnical = async () => {
        if (!currentSetting) return;
        setIsSaving(true);
        try {
            await updateSetting(currentSetting.id, {
                other_settings: {
                    ...currentSetting.other_settings,
                    safety_factor: Number(safetyFactor),
                    wiring_loss: Number(wiringLoss),
                    dod_limit: Number(dodLimit),
                    auto_backup: autoBackup
                }
            });
            toast.success(t('settings.technical_updated', 'Technical parameters updated'));
        } catch (error) {
            toast.error(t('settings.update_failed', 'Failed to update settings'));
        } finally {
            setIsSaving(false);
        }
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
        if (newPassword !== confirmPassword) {
            toast.error(t('auth.passwords_mismatch', 'Passwords do not match'));
            return;
        }
        // Password change logic would go here, likely calling a specific auth API
        toast.error("Password change is not yet implemented on the server");
    };

    const handleDeactivate = () => {
        // Implementation for account deactivation
        toast.error("Deactivation requires administrator approval");
    };

    return (
        <DialogContent className="w-[85vw] max-w-4xl h-[85vh] p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl flex flex-col" dir={i18n.dir()}>
            <DialogHeader className="p-8 pb-4 bg-gray-50/50">
                <DialogTitle className="text-3xl font-black">{t('dashboard.settings', 'Settings')}</DialogTitle>
                <DialogDescription className="font-medium text-neutral/60">
                    {t('settings.description', 'Manage your account preferences and application defaults.')}
                </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="profile" className="flex flex-1 overflow-hidden" orientation="vertical">
                <TabsList className="flex flex-col w-64 bg-gray-50/50 p-4 gap-2 h-full border-e border-gray-100 justify-start rounded-none">
                    <TabsTrigger value="profile" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all font-bold">
                        <User className="w-4 h-4" /> {t('settings.profile', 'Profile')}
                    </TabsTrigger>
                    <TabsTrigger value="technical" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all font-bold">
                        <Cog className="w-4 h-4" /> {t('settings.technical', 'Technical')}
                    </TabsTrigger>
                    <TabsTrigger value="security" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all font-bold">
                        <Shield className="w-4 h-4" /> {t('settings.security', 'Security')}
                    </TabsTrigger>
                    <TabsTrigger value="system" className="w-full justify-start gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all font-bold">
                        <Database className="w-4 h-4" /> {t('settings.system', 'System')}
                    </TabsTrigger>
                    <div className="mt-auto pt-4">
                        <Button onClick={handleLogout} variant="ghost" className="w-full justify-start gap-3 px-4 py-3 rounded-xl text-red-500 hover:text-red-600 hover:bg-red-50 font-bold transition-colors">
                            <LogOut className="w-4 h-4" /> {t('dashboard.logout', 'Logout')}
                        </Button>
                    </div>
                </TabsList>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                        <div className="p-8 space-y-8">

                            <TabsContent value="profile" className="m-0 space-y-6">
                                <div className="flex items-center gap-6 pb-4">
                                    <div className="relative group">
                                        <Avatar className="w-24 h-24 border-4 border-white shadow-xl">
                                            <AvatarImage src={currentUser?.business_logo} />
                                            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">
                                                {currentUser?.username?.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <button className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Upload className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-neutral/80">{currentUser?.username}</h3>
                                        <p className="text-sm font-bold text-neutral/40 uppercase">{currentUser?.account_type} {t('registration.emp_short', 'Account')}</p>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.username', 'Username')}</Label>
                                        <Input value={username} onChange={(e) => setUsername(e.target.value)} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-neutral/40 uppercase">{t('registration.business_name', 'Business Name')}</Label>
                                        <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-neutral/40 uppercase">{t('dashboard.city_label', 'City / Location')}</Label>
                                        <Input value={location} onChange={(e) => setLocation(e.target.value)} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
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

                                <div className="pt-4">
                                    <Button onClick={handleSaveProfile} disabled={isSaving} className="gap-2 h-12 px-8 rounded-xl font-bold shadow-lg shadow-primary/20">
                                        <Save className="w-4 h-4" /> {t('common.save_changes', 'Save Changes')}
                                    </Button>
                                </div>
                            </TabsContent>

                            <TabsContent value="technical" className="m-0 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-neutral/40 uppercase">{t('ble.inverter.safety_factor_label', 'Safety Factor')}</Label>
                                        <Input type="number" step="0.1" value={safetyFactor} onChange={(e) => setSafetyFactor(Number(e.target.value))} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-neutral/40 uppercase">{t('ble.solar_panels.system_losses_label', 'Wiring Loss (%)')}</Label>
                                        <Input type="number" value={wiringLoss} onChange={(e) => setWiringLoss(Number(e.target.value))} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-neutral/40 uppercase">{t('ble.battery_bank.dod_label', 'DoD Limit (%)')}</Label>
                                        <Input type="number" value={dodLimit} onChange={(e) => setDodLimit(Number(e.target.value))} className="bg-gray-50 border-none rounded-xl h-12 font-medium" />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                                    <div className="space-y-0.5">
                                        <Label className="font-bold text-neutral/80">{t('settings.auto_backup', 'Automatic Cloud Backup')}</Label>
                                        <p className="text-xs text-neutral/40 font-medium">{t('settings.auto_backup_desc', 'Automatically sync local changes to the cloud.')}</p>
                                    </div>
                                    <Switch checked={autoBackup} onCheckedChange={setAutoBackup} />
                                </div>

                                <div className="pt-4">
                                    <Button onClick={handleSaveTechnical} disabled={isSaving} className="gap-2 h-12 px-8 rounded-xl font-bold shadow-lg shadow-primary/20">
                                        <Save className="w-4 h-4" /> {t('common.save_changes', 'Save Changes')}
                                    </Button>
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
                                        <Button onClick={handlePasswordChange} className="w-full h-12 rounded-xl font-bold">{t('auth.change_password_now', 'Update Password')}</Button>
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-red-500 uppercase tracking-wider">{t('settings.danger_zone', 'Danger Zone')}</h4>
                                    <div className="p-6 border border-red-100 bg-red-50/30 rounded-2xl flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="font-bold text-red-600">{t('settings.deactivate', 'Deactivate Account')}</Label>
                                            <p className="text-xs text-red-400 font-medium">{t('settings.deactivate_desc', 'Temporarily disable your account and data access.')}</p>
                                        </div>
                                        <Button onClick={handleDeactivate} variant="destructive" className="gap-2 rounded-xl font-bold">
                                            <Trash2 className="w-4 h-4" /> {t('settings.deactivate_button', 'Deactivate')}
                                        </Button>
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="system" className="m-0 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Card className="border-none bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.app_version', 'App Version')}</p>
                                        <p className="text-2xl font-black text-neutral/80">0.1.0-beta</p>
                                    </Card>
                                    <Card className="border-none bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.db_size', 'Local DB Size')}</p>
                                        <p className="text-2xl font-black text-neutral/80">4.2 MB</p>
                                    </Card>
                                    <Card className="border-none bg-gray-50 p-6 flex flex-col gap-2 rounded-2xl">
                                        <p className="text-xs font-bold text-neutral/40 uppercase">{t('settings.last_sync', 'Last Sync')}</p>
                                        <p className="text-lg font-black text-neutral/80">2 mins ago</p>
                                    </Card>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-black text-neutral/80 uppercase tracking-wider">{t('settings.diagnostics', 'Diagnostics & Maintenance')}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Button variant="outline" className="h-16 rounded-2xl justify-start px-6 gap-4 border-gray-100 hover:bg-gray-50 font-bold transition-all">
                                            <Database className="w-5 h-5 text-primary" />
                                            <div className="text-left">
                                                <p>{t('settings.compact_db', 'Compact Database')}</p>
                                                <p className="text-[10px] text-neutral/40 font-medium font-bold uppercase">{t('settings.compact_desc', 'Optimize local storage performance')}</p>
                                            </div>
                                        </Button>
                                        <Button variant="outline" className="h-16 rounded-2xl justify-start px-6 gap-4 border-gray-100 hover:bg-gray-50 font-bold transition-all">
                                            <Trash2 className="w-5 h-5 text-neutral/40" />
                                            <div className="text-left">
                                                <p>{t('settings.clear_cache', 'Clear Image Cache')}</p>
                                                <p className="text-[10px] text-neutral/40 font-medium font-bold uppercase">{t('settings.clear_cache_desc', 'Free up space by removing temporary logos')}</p>
                                            </div>
                                        </Button>
                                    </div>
                                </div>
                            </TabsContent>

                        </div>
                    </ScrollArea>
                </div>
            </Tabs>
        </DialogContent>
    );
}

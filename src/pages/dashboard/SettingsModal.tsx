import { useNavigate } from "react-router-dom";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useUserStore } from "@/store/useUserStore";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function SettingsModal() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { setCurrentUser } = useUserStore();
    const { currentAuthentication, setCurrentAuthentication, updateAuthentication } = useAuthenticationStore();

    const handleLogout = async () => {
        if (currentAuthentication?.auth_id) {
            try {
                await updateAuthentication(currentAuthentication.auth_id, { is_logged_in: false });
            } catch (error) {
                console.error("Failed to update logout state on backend:", error);
            }
        }
        setCurrentUser(null);
        setCurrentAuthentication(null);
        localStorage.removeItem('access_token');
        navigate("/");
    };

    const handleLanguageChange = (lang: string) => {
        i18n.changeLanguage(lang);
    };

    return (
        <DialogContent className="w-[75vw] max-w-[75vw] h-[75vh] bg-white rounded-lg shadow-2xl backdrop-blur-sm flex flex-col">
            <DialogHeader>
                <DialogTitle>{t('dashboard.settings', 'Settings')}</DialogTitle>
            </DialogHeader>
            <div className="flex-grow p-6 space-y-8">
                <div className="space-y-2">
                    <Label htmlFor="language-select">{t('settings.language', 'Language')}</Label>
                    <Select onValueChange={handleLanguageChange} defaultValue={i18n.language}>
                        <SelectTrigger id="language-select" className="w-[240px]">
                            <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="ar">العربية (Arabic)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="absolute bottom-6 right-6">
                    <Button onClick={handleLogout} variant="destructive">
                        {t('dashboard.logout', 'Logout')}
                    </Button>
                </div>
            </div>
        </DialogContent>
    );
}
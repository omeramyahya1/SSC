import { useNavigate } from "react-router-dom";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useUserStore } from "@/store/useUserStore";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function SettingsModal() {
    const { t } = useTranslation();
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

    return (
        <DialogContent className="w-[75vw] max-w-[75vw] h-[75vh] bg-white rounded-lg shadow-2xl backdrop-blur-sm">
            <DialogHeader>
                <DialogTitle>{t('dashboard.settings', 'Settings')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center h-full">
                <Button onClick={handleLogout} variant="destructive">
                    {t('dashboard.logout', 'Logout')}
                </Button>
            </div>
        </DialogContent>
    );
}

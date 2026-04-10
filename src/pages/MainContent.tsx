import { Sidebar } from "./dashboard/Sidebar";
import { InternetAlert } from "./dashboard/InternetAlert";
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

const MainContent = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showFirstTimeLoginPrompt, setShowFirstTimeLoginPrompt } = useAuthenticationStore();

  const handleClosePrompt = () => {
    setShowFirstTimeLoginPrompt(false);
  };

  const handleChangePassword = () => {
    setShowFirstTimeLoginPrompt(false);
    navigate("/change_password");
  };

  useEffect(() => {
    const stopDrop = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // 'dragover' must be prevented for 'drop' to be blocked
    window.addEventListener('dragover', stopDrop, false);
    window.addEventListener('drop', stopDrop, false);

    return () => {
      window.removeEventListener('dragover', stopDrop);
      window.removeEventListener('drop', stopDrop);
    };
  }, []);

  return (
    <div className="flex h-screen w-full font-sans">
      <Toaster />
      <InternetAlert />
      <Sidebar />
      <Outlet />

      <AlertDialog open={showFirstTimeLoginPrompt} onOpenChange={setShowFirstTimeLoginPrompt}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {t('auth.first_login_title', 'Welcome to SSC!')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral/70">
              {t('auth.first_login_desc', 'For your security, we recommend changing your temporary password. You can do this now or later from your profile settings.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleClosePrompt} className="border-neutral/20">
              {t('common.later', 'Later')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleChangePassword} className="bg-primary text-white hover:bg-primary/90">
              {t('auth.change_password_now', 'Change Password Now')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default MainContent;

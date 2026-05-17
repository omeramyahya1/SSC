import { Sidebar } from "./dashboard/Sidebar";
import { InternetAlert } from "./dashboard/InternetAlert";
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useApplicationSettingsStore } from "@/store/useApplicationSettingsStore";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { TCContent } from "@/components/ui/TCContent";
import { Spinner } from "@/components/ui/spinner";
import { useSync } from "@/hooks/useSync";
import { Dialog, DialogTrigger } from "@radix-ui/react-dialog";
import { SettingsModal } from "./dashboard/SettingsModal";

const MainContent = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  useSync();
  const {
    showFirstTimeLoginPrompt,
    setShowFirstTimeLoginPrompt,
    currentAuthentication,
  } = useAuthenticationStore();
  const {
    needsTCUpdate,
    latestTC,
    checkTCStatus,
    recordTCAgreement,
    currentSetting,
  } = useApplicationSettingsStore();
  const [isAgreeing, setIsAgreeing] = useState(false);
  const [showTCModal, setShowTCModal] = useState(false);

  useEffect(() => {
    if (currentAuthentication?.user_uuid) {
      checkTCStatus(currentAuthentication.user_uuid);
    }
  }, [currentAuthentication?.user_uuid, checkTCStatus]);

  useEffect(() => {
    if (currentSetting) {
      setShowTCModal(needsTCUpdate);
    } else {
      setShowTCModal(false);
    }
  }, [needsTCUpdate, currentSetting]);

  const handleAgreeTC = async () => {
    console.log("handleAgreeTC start", {
      latestTCId: latestTC?.id,
      hasSetting: !!currentSetting,
    });

    if (!latestTC?.id) {
      console.warn("No latestTC id found, returning early");
      return;
    }

    setIsAgreeing(true);
    try {
      console.log("Calling recordTCAgreement for", latestTC.id);
      await recordTCAgreement(latestTC.id);
      console.log("recordTCAgreement success");
      setShowTCModal(false);
      toast.success(t("tc.success.title", "Terms Accepted"));
    } catch (e) {
      console.error("Failed to agree to T&C", e);
      toast.error(t("tc.error", "Failed to save agreement"));
    } finally {
      setIsAgreeing(false);
    }
  };

  const handleClosePrompt = () => {
    setShowFirstTimeLoginPrompt(false);
  };

  const handleChangePassword = () => {
    setShowFirstTimeLoginPrompt(false);
    navigate("");
  };

  useEffect(() => {
    const stopDrop = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // 'dragover' must be prevented for 'drop' to be blocked
    window.addEventListener("dragover", stopDrop, false);
    window.addEventListener("drop", stopDrop, false);

    return () => {
      window.removeEventListener("dragover", stopDrop);
      window.removeEventListener("drop", stopDrop);
    };
  }, []);

  return (
    <div className="flex h-screen w-full font-sans">
      <Toaster />
      <InternetAlert />
      <Sidebar />
      <Outlet />

      <AlertDialog
        open={showFirstTimeLoginPrompt}
        onOpenChange={setShowFirstTimeLoginPrompt}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              {t("auth.first_login_title", "Welcome to SSC!")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral/70">
              {t(
                "auth.first_login_desc",
                "For your security, we recommend changing your temporary password. You can do this now or later from your profile settings.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleClosePrompt}
              className="border-neutral/20"
            >
              {t("common.later", "Later")}
            </AlertDialogCancel>

            <Dialog>
              <DialogTrigger asChild>
                <AlertDialogAction
                  onClick={handleChangePassword}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  {t("auth.change_password_now", "Change Password Now")}
                </AlertDialogAction>
              </DialogTrigger>
              <SettingsModal passwordChange={true} />
            </Dialog>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showTCModal} onOpenChange={setShowTCModal}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] bg-white flex flex-col p-0 overflow-hidden">
          <AlertDialogHeader className="p-6 pb-2">
            <AlertDialogTitle className="text-2xl text-center font-bold">
              {t("tc.updated_terms_title", "New Terms and Conditions")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "tc.updated_tc",
                "We have updated our terms to better serve our users. Please review and agree to continue.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex-1 overflow-hidden px-6">
            <ScrollArea className="h-[50vh] border-2 p-4 rounded-base bg-neutral/5">
              <TCContent
                content={
                  latestTC?.content?.[i18n.language === "ar" ? "ar" : "en"]
                }
                metadata={latestTC?.content?.metadata}
              />
            </ScrollArea>
          </div>

          <AlertDialogFooter className="p-6 bg-gray-50/50 mt-4">
            <Button
              onClick={handleAgreeTC}
              disabled={isAgreeing || !latestTC?.id}
              className="bg-primary text-white hover:bg-primary/90 min-w-[120px] font-bold"
            >
              {isAgreeing ? <Spinner /> : t("tc.accept_terms", "I Accept")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MainContent;

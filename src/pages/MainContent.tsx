import { Sidebar } from "./dashboard/Sidebar";
import { InternetAlert } from "./dashboard/InternetAlert";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useApplicationSettingsStore } from "@/store/useApplicationSettingsStore";
import { useUserStore } from "@/store/useUserStore";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
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
import { Dialog } from "@radix-ui/react-dialog";
import { SettingsModal } from "./dashboard/SettingsModal";
import { AlertCircle, CreditCard, Settings as SettingsIcon } from "lucide-react";

const MainContent = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
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
  const { currentUser } = useUserStore();
  const { currentSubscription, refreshSubscriptionStatus } =
    useSubscriptionStore();

  const [isAgreeing, setIsAgreeing] = useState(false);
  const [showTCModal, setShowTCModal] = useState(false);

  useEffect(() => {
    if (currentAuthentication?.user_uuid) {
      checkTCStatus(currentAuthentication.user_uuid);
      refreshSubscriptionStatus(currentAuthentication.user_uuid);
    }
  }, [
    currentAuthentication?.user_uuid,
    checkTCStatus,
    refreshSubscriptionStatus,
  ]);

  useEffect(() => {
    if (currentSetting) {
      setShowTCModal(needsTCUpdate);
    } else {
      setShowTCModal(false);
    }
  }, [needsTCUpdate, currentSetting]);

  const handleAgreeTC = async () => {
    if (!latestTC?.id) return;
    setIsAgreeing(true);
    try {
      await recordTCAgreement(latestTC.id);
      setShowTCModal(false);
      toast.success(t("tc.success.title", "Terms Accepted"));
    } catch (e) {
      toast.error(t("tc.error", "Failed to save agreement"));
    } finally {
      setIsAgreeing(false);
    }
  };

  const handleClosePrompt = () => {
    setShowFirstTimeLoginPrompt(false);
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleChangePassword = () => {
    setShowFirstTimeLoginPrompt(false);
    setIsSettingsOpen(true);
  };

  const isExpired = currentUser?.status === "expired";
  const isGrace = currentUser?.status === "grace";
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "user";

  // Check if current route is allowed during expiration
  const isAllowedRoute =
    location.pathname.includes("/subscription") ||
    location.pathname.includes("/settings");

  return (
    <div className="flex h-screen w-full font-sans relative overflow-hidden">
      <Toaster />
      <InternetAlert />
      <Sidebar />

      {/* Main App Content */}
      <main className="flex-1 relative overflow-hidden">
        {/* Grace Period Banner */}
        {isGrace && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} />
              <p className="text-sm font-medium">
                {t(
                  "sub.grace_warning",
                  "Your subscription has expired. You are currently in a grace period. Please renew to avoid service interruption.",
                )}
              </p>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="bg-white text-amber-600 border-white hover:bg-amber-50"
                onClick={() => navigate("/subscription")}
              >
                {t("sub.renew_now", "Renew Now")}
              </Button>
            )}
          </div>
        )}

        {/* Blocking Overlay for Expired Accounts */}
        {isExpired && !isAllowedRoute && (
          <div className="absolute inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-6">
            <div className="bg-white border-2 border-destructive/20 shadow-2xl rounded-2xl max-w-lg w-full p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-neutral">
                  {t("sub.expired_title", "Subscription Expired")}
                </h2>
                <p className="text-neutral/60">
                  {isAdmin
                    ? t(
                        "sub.expired_desc_admin",
                        "Your access has been suspended due to an expired subscription. Please renew your plan to continue using all features.",
                      )
                    : t(
                        "sub.expired_desc_employee",
                        "Your organization's subscription has expired. Please contact your administrator to restore access.",
                      )}
                </p>
              </div>

              {isAdmin ? (
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    className="h-12 gap-2 text-lg font-bold"
                    onClick={() => navigate("/subscription")}
                  >
                    <CreditCard size={20} />
                    {t("sub.manage_subscription", "Manage Subscription")}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 gap-2 text-lg font-bold"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    <SettingsIcon size={20} />
                    {t("sub.go_to_settings", "Settings")}
                  </Button>
                </div>
              ) : (
                <div className="p-4 bg-neutral/5 rounded-xl border border-neutral/10">
                  <p className="text-sm font-medium text-neutral/40 italic">
                    {t(
                      "sub.contact_admin_help",
                      "Tip: Your admin can renew the plan from the Subscription section.",
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <Outlet />
      </main>

      {/* Modals and Dialogs */}
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
            <AlertDialogAction
              onClick={handleChangePassword}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {t("auth.change_password_now", "Change Password Now")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SettingsModal passwordChange={true} />
      </Dialog>

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
                  latestTC?.content?.[i18n.language === "ar" ? "ar" : "en"] ||
                  latestTC?.content?.en ||
                  latestTC?.content?.ar
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

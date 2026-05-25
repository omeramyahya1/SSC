import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVersionStore } from "@/store/useVersionStore";
import { useSystemInfoStore } from "@/store/useSystemInfoStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { relaunch } from "@tauri-apps/plugin-process";

export const VersionHandler = () => {
  const { t } = useTranslation();
  const [showOptionalUpdate, setShowOptionalUpdate] = useState(true);
  const {
    checkVersion,
    installUpdate,
    isBetaWarningOpen,
    closeBetaWarning,
    isNotificationOpen,
    closeNotification,
    isUpdateRequired,
    isUpdateAvailable,
    isDownloading,
    downloadProgress,
    manifest,
    tauriUpdate,
  } = useVersionStore();

  const { systemInfo, fetchSystemInfo } = useSystemInfoStore();

  useEffect(() => {
    fetchSystemInfo();
  }, [fetchSystemInfo]);

  useEffect(() => {
    const version = systemInfo?.app_version;
    checkVersion(version);

    // Check for updates periodically every hour
    const interval = setInterval(() => checkVersion(version), 3600000);
    return () => clearInterval(interval);
  }, [checkVersion, systemInfo?.app_version]);

  const handleUpdate = async () => {
    await installUpdate();
    // After install, we should relaunch
    await relaunch();
  };

  return (
    <>
      {/* Beta Warning Modal */}
      <AlertDialog open={isBetaWarningOpen} onOpenChange={closeBetaWarning}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {t("versioning.beta_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("versioning.beta_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={closeBetaWarning}>
              {t("common.understand")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Global Notification Dialog */}
      <AlertDialog open={isBetaWarningOpen? false : isNotificationOpen} onOpenChange={closeNotification}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("versioning.notification_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {manifest?.notification?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={closeNotification}>
              {t("common.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force Update Overlay */}
      {isUpdateRequired && (
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white border shadow-lg rounded-lg max-w-md w-full p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">
              {t("versioning.update_required_title")}
            </h2>
            <p className="mb-6 text-muted-foreground">
              {t("versioning.update_required_description")}
            </p>
            {isDownloading ? (
              <div className="space-y-4">
                <Progress value={downloadProgress} />
                <p className="text-sm">{Math.round(downloadProgress)}%</p>
              </div>
            ) : (
              <Button className="w-full" onClick={handleUpdate}>
                {t("versioning.update_now")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Minor Update Toast/Banner */}
      {isUpdateAvailable && !isUpdateRequired && showOptionalUpdate && (
        <div className="fixed bottom-4 end-4 z-[50] animate-in slide-in-from-right">
          <div className="bg-white border text-primary-foreground px-4 py-3 rounded-lg shadow-lg flex flex-col gap-2 min-w-[300px]">
            <div className="flex items-center justify-between gap-4">
              <p
                className="absolute top-2 start-2 hover:cursor-pointer"
                onClick={() => setShowOptionalUpdate(false)}
              >
                X
              </p>
              <p className="text-sm font-medium ms-4">
                {t("versioning.update_available", {
                  version: tauriUpdate?.version || manifest?.latest_version,
                })}
              </p>
              {!isDownloading && (
                <Button variant="default" size="sm" onClick={handleUpdate}>
                  {t("versioning.update")}
                </Button>
              )}
            </div>
            {isDownloading && (
              <div className="space-y-1">
                <Progress
                  value={downloadProgress}
                  className="h-1 bg-primary-foreground/20"
                />
                <p className="text-[10px] text-right">
                  {Math.round(downloadProgress)}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

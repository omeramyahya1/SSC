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
import { invoke } from "@tauri-apps/api/core";

export const VersionHandler = () => {
  const { t } = useTranslation();
  const [showOptionalUpdate, setShowOptionalUpdate] = useState(true);
  const [isFinalizing, setIsFinalizing] = useState(false);
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
    activeNotification,
    tauriUpdate,
  } = useVersionStore();

  const { i18n } = useTranslation();
  const currentMessage =
    i18n.language === "ar"
      ? activeNotification?.message_ar || activeNotification?.message_en
      : activeNotification?.message_en || activeNotification?.message_ar;

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
    try {
      // 1. Install the update (downloads and prepares)
      await installUpdate();

      // 2. Start finalizing UI
      setIsFinalizing(true);

      // 3. Gracefully shut down the Python sidecar
      await invoke("prepare_for_update");

      // 4. Relaunch the application
      await relaunch();
    } catch (error) {
      console.error("Update failed:", error);
      setIsFinalizing(false);
    }
  };

  return (
    <>
      {/* Finalizing Overlay */}
      {isFinalizing && (
        <div className="fixed inset-0 z-[10000] bg-background/90 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="text-center animate-pulse">
            <h2 className="text-xl font-semibold mb-2">
              {t("versioning.finalizing_title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("versioning.finalizing_description")}
            </p>
          </div>
        </div>
      )}

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
              {currentMessage}
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
      {isUpdateRequired && !isFinalizing && (
        <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white border shadow-lg rounded-lg max-w-md w-full p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">
              {isDownloading? t("downloading"):t("versioning.update_required_title")}
            </h2>
            <p className="mb-4">
              {!isDownloading && t("versioning.update_required_description", {
                  version: tauriUpdate?.version || manifest?.latest_version,
                })}
            </p>
            {isDownloading ? (
              <div className="space-y-4">
                <Progress
                  value={downloadProgress}
                  className="h-2  bg-primary-foreground/20 border"
                  />
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
          <div className="bg-white border-[1.5px] text-primary-foreground px-4 py-3 rounded-lg shadow-lg flex flex-col gap-2 min-w-[300px]">
            <div className="flex items-center justify-between gap-4">
              {!isDownloading && (
                <p
                className="absolute align-middle start-2 ms-1 hover:cursor-pointer"
                onClick={() => setShowOptionalUpdate(false)}
              >
                X
              </p>
              )}
              <p className="text-sm font-bold ms-4">
                {isDownloading? t("downloading"):t("versioning.update_available", {
                  version: tauriUpdate?.version || manifest?.latest_version,
                })}
              </p>
              {!isDownloading && (
                <Button variant="default" size="sm" className="font-bold" onClick={handleUpdate}>
                  {t("versioning.update")}
                </Button>
              )}
            </div>
            {isDownloading && (
              <div className="space-y-1">
                <Progress
                  value={downloadProgress}
                  className="h-2 bg-primary-foreground/20 border"
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

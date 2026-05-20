import { create } from "zustand";
import axios from "axios";
import {
  AppChannel,
  AppManifest,
  compareVersions,
  getAppChannel,
} from "@/lib/version";
import { getVersion } from "@tauri-apps/api/app";
import { check, Update } from "@tauri-apps/plugin-updater";

interface VersionStore {
  hasDismissedBetaWarning: boolean;
  channel: AppChannel;
  currentVersion: string;
  manifest: AppManifest | null;
  tauriUpdate: Update | null;
  isLoading: boolean;
  isBetaWarningOpen: boolean;
  isNotificationOpen: boolean;
  isUpdateRequired: boolean;
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;

  checkVersion: () => Promise<void>;
  installUpdate: () => Promise<boolean>;
  closeBetaWarning: () => void;
  closeNotification: () => void;
}

const MANIFEST_URL =
  "https://raw.githubusercontent.com/omeramyahya1/SSC/main/manifest.json";

export const useVersionStore = create<VersionStore>((set, get) => ({
  hasDismissedBetaWarning: false,
  channel: getAppChannel(),
  currentVersion: "0.0.0",
  manifest: null,
  tauriUpdate: null,
  isLoading: false,
  isBetaWarningOpen: false,
  isNotificationOpen: false,
  isUpdateRequired: false,
  isUpdateAvailable: false,
  isDownloading: false,
  downloadProgress: 0,
  error: null,

  checkVersion: async () => {
    set({ isLoading: true, error: null });
    try {
      const currentVersion = await getVersion();
      const channel = getAppChannel();

      // 1. Fetch our custom manifest for logic/notifications
      const { data: manifest } = await axios.get<AppManifest>(MANIFEST_URL);

      // 2. Check for Tauri updates (for download/install)
      const tauriUpdate = await check();

      const isUpdateRequired =
        compareVersions(currentVersion, manifest.critical_min_version) < 0;
      const isUpdateAvailable =
        tauriUpdate?.available ||
        compareVersions(currentVersion, manifest.latest_version) < 0;

      // Beta Warning: show if channel is beta
      const { hasDismissedBetaWarning } = get();
      const isBetaWarningOpen = channel === "beta" && !hasDismissedBetaWarning;

      // Notification: show if manifest has a new notification ID
      const lastSeenNotificationId = localStorage.getItem(
        "last_seen_notification_id",
      );
      const isNotificationOpen =
        !!manifest.notification &&
        manifest.notification.id !== lastSeenNotificationId;

      set({
        channel,
        currentVersion,
        manifest,
        tauriUpdate,
        isBetaWarningOpen,
        isNotificationOpen,
        isUpdateRequired,
        isUpdateAvailable,
        isLoading: false,
      });
    } catch (e: any) {
      console.error("Failed to check version:", e);
      set({ error: e.message, isLoading: false });
    }
  },

  installUpdate: async () => {
    const { tauriUpdate } = get();
    if (!tauriUpdate) return false;

    try {
      set({ isDownloading: true, downloadProgress: 0 });

      let downloaded = 0;
      let contentLength = 0;

      await tauriUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              set({ downloadProgress: (downloaded / contentLength) * 100 });
            }
            break;
          case "Finished":
            set({ isDownloading: false });
            break;
        }
      });
      return true;
    } catch (e: any) {
      set({ error: e.message, isDownloading: false });
      return false;
    }
  },

  closeBetaWarning: () =>
    set({ isBetaWarningOpen: false, hasDismissedBetaWarning: true }),
  closeNotification: () => {
    const { manifest } = get();
    if (manifest?.notification) {
      localStorage.setItem(
        "last_seen_notification_id",
        manifest.notification.id,
      );
    }
    set({ isNotificationOpen: false });
  },
}));

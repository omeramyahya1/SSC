import { create } from "zustand";
import axios from "axios";
import {
  AppChannel,
  AppManifest,
  compareVersions,
  getAppChannel,
  isPrereleaseVersion,
  SupabaseNotification,
} from "@/lib/version";
import { getVersion } from "@tauri-apps/api/app";
import { check, Update } from "@tauri-apps/plugin-updater";
import { supabase } from "@/lib/supabaseClient";

interface VersionStore {
  hasDismissedBetaWarning: boolean;
  channel: AppChannel;
  currentVersion: string;
  manifest: AppManifest | null;
  activeNotification: SupabaseNotification | null;
  tauriUpdate: Update | null;
  isLoading: boolean;
  isBetaWarningOpen: boolean;
  isNotificationOpen: boolean;
  isUpdateRequired: boolean;
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;

  checkVersion: (version: any) => Promise<void>;
  installUpdate: () => Promise<boolean>;
  closeBetaWarning: () => void;
  closeNotification: () => void;
}

const MANIFEST_URL =
  "https://raw.githubusercontent.com/omeramyahya1/SSC/main/manifest.json";

function isUpdateVersionAllowed(channel: AppChannel, version: string): boolean {
  if (channel === "dev") return true;
  const prerelease = isPrereleaseVersion(version);
  if (channel === "beta") return prerelease;
  return !prerelease;
}

export const useVersionStore = create<VersionStore>((set, get) => ({
  hasDismissedBetaWarning: false,
  channel: getAppChannel(),
  currentVersion: "0.0.0",
  manifest: null,
  activeNotification: null,
  tauriUpdate: null,
  isLoading: false,
  isBetaWarningOpen: false,
  isNotificationOpen: false,
  isUpdateRequired: false,
  isUpdateAvailable: false,
  isDownloading: false,
  downloadProgress: 0,
  error: null,

  checkVersion: async (versionOverride?: string) => {
    set({ isLoading: true, error: null });
    try {
      const currentVersion = versionOverride || (await getVersion());
      const channel = getAppChannel(currentVersion);

      // 1. Fetch our custom manifest for logic/notifications
      const { data: manifest } = await axios.get<AppManifest>(MANIFEST_URL);

      // 2. Fetch the latest active notification from Supabase
      const { data: notifications } = await supabase
        .from("app_notifications")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      const activeNotification = (notifications?.[0] as SupabaseNotification) || null;

      // 3. Check for updates ONLY if NOT in beta
      let tauriUpdate: Update | null = null;
      let isUpdateRequired = false;
      let isUpdateAvailable = false;

      if (channel !== "beta") {
        tauriUpdate = await check();

        isUpdateRequired =
          isUpdateVersionAllowed(channel, manifest.critical_min_version) &&
          compareVersions(currentVersion, manifest.critical_min_version) < 0;

        const eligibleTauriUpdate =
          tauriUpdate?.available &&
          (!tauriUpdate.version ||
            isUpdateVersionAllowed(channel, tauriUpdate.version))
            ? tauriUpdate
            : null;

        const manifestAllowed =
          isUpdateVersionAllowed(channel, manifest.latest_version) &&
          compareVersions(currentVersion, manifest.latest_version) < 0;

        isUpdateAvailable = !!eligibleTauriUpdate || manifestAllowed;
        tauriUpdate = eligibleTauriUpdate;
      }

      // Beta Warning: show if channel is beta
      const { hasDismissedBetaWarning } = get();
      const isBetaWarningOpen = channel === "beta" && !hasDismissedBetaWarning;

      // Notification: show if supabase has a new notification ID
      const lastSeenNotificationId = localStorage.getItem(
        "last_seen_notification_id",
      );
      const isNotificationOpen =
        !!activeNotification &&
        activeNotification.id !== lastSeenNotificationId;

      set({
        channel,
        currentVersion,
        manifest,
        activeNotification,
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
    const { activeNotification } = get();
    if (activeNotification) {
      localStorage.setItem(
        "last_seen_notification_id",
        activeNotification.id,
      );
    }
    set({ isNotificationOpen: false });
  },
}));
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSyncLogStore } from "@/store/useSyncLogStore";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useVersionStore } from "@/store/useVersionStore";
import { refreshStores, registerStore, StoreKeys } from "@/api/storeRegistry";

let isSyncLogStoreRegistered = false;

export const useSync = () => {
  const { performSync, isSyncing, lastSyncTime } = useSyncLogStore();
  const { currentAuthentication } = useAuthenticationStore();
  const { isUpdateRequired } = useVersionStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const location = useLocation();
  const isLoggedIn = !!currentAuthentication?.is_logged_in;

  // keep latest isSyncing for event handlers / effects
  const isSyncingRef = useRef(isSyncing);
  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  // optional: collapse bursts (mount + navigation, etc.)
  const lastRequestAtRef = useRef(0);

  const requestSync = useCallback(async () => {
    if (!isLoggedIn || !isOnline || isUpdateRequired) return; // prevent sync if update required
    if (isSyncingRef.current) return;

    const now = Date.now();
    if (now - lastRequestAtRef.current < 2000) return; // tweak or remove
    lastRequestAtRef.current = now;

    await performSync();
  }, [isLoggedIn, isOnline, isUpdateRequired, performSync]);

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);
    return () => {
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
    };
  }, []);

  // 1) startup / login changes
  useEffect(() => {
    requestSync();
  }, [requestSync]);

  // 2) navigation
  useEffect(() => {
    if (!isLoggedIn) return;

    const timeoutId = window.setTimeout(async () => {
      if (isSyncingRef.current) return;
      await requestSync();
      // Refresh all stores to ensure UI has latest local data after sync
      refreshStores(Object.values(StoreKeys));
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname, isLoggedIn, requestSync]);

  // 3) back online
  useEffect(() => {
    const handleOnline = () => requestSync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [requestSync]);

  // 4) periodic
  useEffect(() => {
    if (!isLoggedIn) return;

    const id = setInterval(() => requestSync(), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [isLoggedIn, requestSync]);

  if (!isSyncLogStoreRegistered) {
    registerStore(StoreKeys.SyncLog, () => {
      useSyncLogStore.getState().fetchSyncLogs();
    });
    isSyncLogStoreRegistered = true;
  }

  return { sync: requestSync, isSyncing, lastSyncTime };
};

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSyncLogStore } from "@/store/useSyncLogStore";
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useVersionStore } from "@/store/useVersionStore";
import { refreshStores, registerStore, StoreKeys, StoreKey } from "@/api/storeRegistry";

let isSyncLogStoreRegistered = false;

function getStoresForPath(pathname: string): StoreKey[] {
  const path = pathname.replace(/\/$/, "");

  if (path.includes("/home/customers")) {
    return [StoreKeys.Customer, StoreKeys.Project];
  }
  if (path.includes("/home/inventory")) {
    return [StoreKeys.Inventory];
  }
  if (path.includes("/home/sales")) {
    return [StoreKeys.Invoice, StoreKeys.Payment, StoreKeys.Customer];
  }
  if (path.includes("/home/team")) {
    return [StoreKeys.Organization, StoreKeys.Branch, StoreKeys.User];
  }
  if (path.includes("/home/dashboard")) {
    return [StoreKeys.Project, StoreKeys.Customer, StoreKeys.Subscription, StoreKeys.ApplicationSettings];
  }

  return Object.values(StoreKeys);
}

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
      if (!isOnline || isUpdateRequired || isSyncingRef.current) return;
      await requestSync();
      // Silently refresh only the stores relevant to the current page path
      const targetStores = getStoresForPath(location.pathname);
      refreshStores(targetStores, { silent: true });
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname, isLoggedIn, isOnline, isUpdateRequired, requestSync]);

  // 3) back online
  useEffect(() => {
    const handleOnline = () => requestSync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [requestSync]);

  // 4) periodic
  useEffect(() => {
    if (!isLoggedIn) return;

    const id = setInterval(async () => {
      if (!isOnline || isUpdateRequired || isSyncingRef.current) return;
      await requestSync();
      // Silently refresh all stores periodically to keep data fresh without interrupting the user
      refreshStores(Object.values(StoreKeys), { silent: true });
    }, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [isLoggedIn, isOnline, isUpdateRequired, requestSync]);

  if (!isSyncLogStoreRegistered) {
    registerStore(StoreKeys.SyncLog, () => {
      useSyncLogStore.getState().fetchSyncLogs();
    }, useSyncLogStore);
    isSyncLogStoreRegistered = true;
  }

  return { sync: requestSync, isSyncing, lastSyncTime };
};

import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSyncLogStore } from '@/store/useSyncLogStore';
import { useAuthenticationStore } from '@/store/useAuthenticationStore';

export const useSync = () => {
  const { performSync, isSyncing, lastSyncTime } = useSyncLogStore();
  const { currentAuthentication } = useAuthenticationStore();
  const location = useLocation();

  const isLoggedIn = !!currentAuthentication?.is_logged_in;

  // keep latest isSyncing for event handlers / effects
  const isSyncingRef = useRef(isSyncing);
  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  // optional: collapse bursts (mount + navigation, etc.)
  const lastRequestAtRef = useRef(0);

  const requestSync = useCallback(() => {
    if (!isLoggedIn) return;
    if (isSyncingRef.current) return;

    const now = Date.now();
    if (now - lastRequestAtRef.current < 300) return; // tweak or remove
    lastRequestAtRef.current = now;

    performSync();
  }, [isLoggedIn, performSync]);

  // 1) startup / login changes
  useEffect(() => {
    requestSync();
  }, [requestSync]);

  // 2) navigation
  useEffect(() => {
    if (!isLoggedIn) return;

    const timeoutId = window.setTimeout(() => {
      if (isSyncingRef.current) return;
      performSync();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [location.pathname, isLoggedIn, performSync]);

  // 3) back online
  useEffect(() => {
    const handleOnline = () => requestSync();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [requestSync]);

  // 4) periodic
  useEffect(() => {
    if (!isLoggedIn) return;

    const id = setInterval(() => requestSync(), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [isLoggedIn, requestSync]);

  return { sync: performSync, isSyncing, lastSyncTime };
};

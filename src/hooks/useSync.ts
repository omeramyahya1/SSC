import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSyncLogStore } from '@/store/useSyncLogStore';
import { useAuthenticationStore } from '@/store/useAuthenticationStore';

/**
 * Hook to manage automatic and manual synchronization.
 */
export const useSync = () => {
    const { performSync, isSyncing, lastSyncTime } = useSyncLogStore();
    const { currentAuthentication } = useAuthenticationStore();
    const location = useLocation();

    const isLoggedIn = !!currentAuthentication?.is_logged_in;

    // 1. App Startup & Auth Lifecycle
    useEffect(() => {
        if (isLoggedIn) {
            performSync();
        }
    }, [isLoggedIn, performSync]);

    // 2. State Transitions (after Navigations)
    useEffect(() => {
        if (isLoggedIn) {
            // Optional: debounce this if needed
            performSync();
        }
    }, [location.pathname, isLoggedIn, performSync]);

    // 3. Network Recovery (when back online)
    useEffect(() => {
        const handleOnline = () => {
            if (isLoggedIn) {
                performSync();
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [isLoggedIn, performSync]);

    // 4. Periodic Sync (every 2 minutes)
    useEffect(() => {
        if (!isLoggedIn) return;

        const interval = setInterval(() => {
            performSync();
        }, 2 * 60 * 1000);

        return () => clearInterval(interval);
    }, [isLoggedIn, performSync]);

    return {
        sync: performSync,
        isSyncing,
        lastSyncTime
    };
};

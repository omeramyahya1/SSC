// src/store/useSyncLogStore.ts
import { syncLogService, SyncLog, NewSyncLogData } from '@/api/syncLogService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing sync log data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `syncLogService`.
 */
export const useSyncLogStore = createCrudStore<SyncLog, NewSyncLogData>(syncLogService);

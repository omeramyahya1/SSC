// src/store/useApplicationSettingsStore.ts
import { applicationSettingsService, ApplicationSettings, NewApplicationSettingsData } from '@/api/applicationSettingsService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing application settings data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `applicationSettingsService`.
 */
export const useApplicationSettingsStore = createCrudStore<ApplicationSettings, NewApplicationSettingsData>(applicationSettingsService);

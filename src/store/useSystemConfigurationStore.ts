// src/store/useSystemConfigurationStore.ts
import { systemConfigurationService, SystemConfiguration, NewSystemConfigurationData } from '@/api/systemConfigurationService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing system configuration data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `systemConfigurationService`.
 */
export const useSystemConfigurationStore = createCrudStore<SystemConfiguration, NewSystemConfigurationData>(systemConfigurationService);

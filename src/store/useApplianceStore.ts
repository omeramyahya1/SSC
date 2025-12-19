// src/store/useApplianceStore.ts
import { applianceService, Appliance, NewApplianceData } from '@/api/applianceService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing appliance data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `applianceService`.
 */
export const useApplianceStore = createCrudStore<Appliance, NewApplianceData>(applianceService);

// src/store/useSubscriptionStore.ts
import { subscriptionService, Subscription, NewSubscriptionData } from '@/api/subscriptionService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing subscription data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `subscriptionService`.
 */
export const useSubscriptionStore = createCrudStore<Subscription, NewSubscriptionData>(subscriptionService);

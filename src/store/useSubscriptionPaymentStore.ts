// src/store/useSubscriptionPaymentStore.ts
import { subscriptionPaymentService, SubscriptionPayment, NewSubscriptionPaymentData } from '@/api/subscriptionPaymentService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing subscription payment data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `subscriptionPaymentService`.
 */
export const useSubscriptionPaymentStore = createCrudStore<SubscriptionPayment, NewSubscriptionPaymentData>(subscriptionPaymentService);

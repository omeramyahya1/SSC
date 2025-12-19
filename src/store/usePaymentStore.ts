// src/store/usePaymentStore.ts
import { paymentService, Payment, NewPaymentData } from '@/api/paymentService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing payment data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `paymentService`.
 */
export const usePaymentStore = createCrudStore<Payment, NewPaymentData>(paymentService);

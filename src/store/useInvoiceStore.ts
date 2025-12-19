// src/store/useInvoiceStore.ts
import { invoiceService, Invoice, NewInvoiceData } from '@/api/invoiceService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing invoice data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `invoiceService`.
 */
export const useInvoiceStore = createCrudStore<Invoice, NewInvoiceData>(invoiceService);

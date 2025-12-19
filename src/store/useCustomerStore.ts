// src/store/useCustomerStore.ts
import { customerService, Customer, NewCustomerData } from '@/api/customerService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing customer data.
 *
 * This store is created using the generic `createCrudStore` factory,
 * which provides a full set of CRUD (Create, Read, Update, Delete)
 * operations, state management for items, loading status, and errors.
 *
 * It is powered by the `customerService`, which handles the actual
 * API communication with the backend.
 *
 * @example
 * // In a React component:
 * const { items: customers, isLoading, fetchItems } = useCustomerStore();
 *
 * useEffect(() => {
 *   fetchItems();
 * }, [fetchItems]);
 */
export const useCustomerStore = createCrudStore<Customer, NewCustomerData>(customerService);

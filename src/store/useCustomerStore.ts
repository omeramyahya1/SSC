// src/store/useCustomerStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Customer {
  customer_id: number;
  full_name: string;
  date_created: string;
  updated_at: string;
  phone_number?: string | null;
  email?: string | null;
  org_id?: number | null;
  user_id?: number | null;
}

export type NewCustomerData = Omit<Customer, 'customer_id' | 'date_created' | 'updated_at'>;

const resource = '/customers';

// --- 2. Define Store ---

export interface CustomerStore {
  customers: Customer[];
  currentCustomer: Customer | null;
  isLoading: boolean;
  error: string | null;
  fetchCustomers: () => Promise<void>;
  fetchCustomer: (id: number) => Promise<void>;
  createCustomer: (data: NewCustomerData) => Promise<Customer | undefined>;
  updateCustomer: (id: number, data: Partial<NewCustomerData>) => Promise<Customer | undefined>;
  deleteCustomer: (id: number) => Promise<void>;
  setCurrentCustomer: (customer: Customer | null) => void;
}

export const useCustomerStore = create<CustomerStore>((set) => ({
  customers: [],
  currentCustomer: null,
  isLoading: false,
  error: null,

  setCurrentCustomer: (customer) => {
    set({ currentCustomer: customer });
  },

  fetchCustomers: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Customer[]>(resource);
      set({ customers: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch customers";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchCustomer: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Customer>(`${resource}/${id}`);
      set({ currentCustomer: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch customer ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createCustomer: async (newCustomerData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Customer>(resource, newCustomerData);
      set((state) => ({ customers: [...state.customers, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create customer";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateCustomer: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Customer>(`${resource}/${id}`, updatedData);
      set((state) => ({
        customers: state.customers.map((c) => (c.customer_id === id ? data : c)),
        currentCustomer: state.currentCustomer?.customer_id === id ? data : state.currentCustomer,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update customer ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteCustomer: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        customers: state.customers.filter((c) => c.customer_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete customer ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));
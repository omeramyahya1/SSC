// src/store/useInvoiceStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface InvoiceDetails {
  shipping_fee: number;
  installation_fee: number;
  discount_percent: number;
  due_date?: string;
  terms_and_conditions?: string;
  enable_custom_terms?: boolean;
}

export interface Invoice {
  uuid: string;
  invoice_id: number;
  project_uuid: string;
  user_uuid: string;
  amount: number;
  status: "paid" | "pending" | "partial";
  issued_at?: string;
  invoice_details: InvoiceDetails;
  invoice_items?: any; // Snapshot of items sold
  created_at: string;
  updated_at: string;
  is_dirty: boolean;

}

export type NewInvoiceData = Partial<Omit<Invoice, 'uuid' | 'created_at' | 'updated_at' | 'is_dirty'>>;

const resource = '/invoices';
const createByProject = new Map<string, Promise<Invoice | undefined>>();

// --- 2. Define Store ---

export interface InvoiceStore {
  invoices: Invoice[];
  currentInvoice: Invoice | null;
  isLoading: boolean;
  error: string | null;
  fetchInvoices: (params?: { 
      project_uuid?: string; 
      org_uuid?: string; 
      branch_uuid?: string;
      status?: string;
    }) => Promise<void>;
  fetchInvoice: (uuid: string) => Promise<void>;
  fetchInvoiceByProject: (projectUuid: string) => Promise<Invoice | undefined>;
  createInvoice: (data: NewInvoiceData) => Promise<Invoice | undefined>;
  updateInvoice: (uuid: string, data: Partial<NewInvoiceData>) => Promise<Invoice | undefined>;
  deleteInvoice: (uuid: string, userUuid?: string) => Promise<void>;
  issueInvoice: (invoiceUuid: string, userUuid: string) => Promise<void>;
  setCurrentInvoice: (invoice: Invoice | null) => void;
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  invoices: [],
  currentInvoice: null,
  isLoading: false,
  error: null,

  setCurrentInvoice: (invoice) => {
    set({ currentInvoice: invoice });
  },

  fetchInvoices: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Invoice[]>(resource, { params });
      set({ invoices: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch invoices";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchInvoice: async (uuid) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Invoice>(`${resource}/${uuid}`);
      set({ currentInvoice: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch invoice ${uuid}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchInvoiceByProject: async (projectUuid) => {
      set({ isLoading: true, error: null });
      try {
          const { data } = await api.get<Invoice>(`${resource}/project/${projectUuid}`);
          set({ currentInvoice: data, isLoading: false });
          return data;
      } catch (e: any) {
          // If not found (404), we might just return undefined without setting error
          if (e.response?.status === 404) {
              set({ isLoading: false });
              return undefined;
          }
          const errorMsg = e.message || `Failed to fetch invoice for project ${projectUuid}`;
          set({ error: errorMsg, isLoading: false });
          return undefined;
      }
  },

  createInvoice: async (newInvoiceData) => {
    const projectUuid = newInvoiceData.project_uuid;
    if (projectUuid) {
      const state = get();
      const existing =
        state.currentInvoice?.project_uuid === projectUuid
          ? state.currentInvoice
          : state.invoices.find((i) => i.project_uuid === projectUuid);
      if (existing) return existing;

      const inflight = createByProject.get(projectUuid);
      if (inflight) return inflight;
    }

    const createPromise = (async () => {
      set({ isLoading: true, error: null });
      try {
        const { data } = await api.post<Invoice>(resource, newInvoiceData);
        set((state) => ({
          invoices: [...state.invoices, data],
          currentInvoice: data,
          isLoading: false
        }));
        return data;
      } catch (e: any) {
        const errorMsg = e.response?.data?.error || e.message || "Failed to create invoice";
        set({ error: errorMsg, isLoading: false });
        console.error(errorMsg, e);
        return undefined;
      } finally {
        if (projectUuid) createByProject.delete(projectUuid);
      }
    })();

    if (projectUuid) createByProject.set(projectUuid, createPromise);
    return createPromise;
  },

  updateInvoice: async (uuid, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Invoice>(`${resource}/${uuid}`, updatedData);
      set((state) => ({
        invoices: state.invoices.map((i) => (i.uuid === uuid ? data : i)),
        currentInvoice: state.currentInvoice?.uuid === uuid ? data : state.currentInvoice,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to update invoice ${uuid}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteInvoice: async (uuid, userUuid) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${uuid}`, {
          params: { user_uuid: userUuid }
      });
      set((state) => ({
        invoices: state.invoices.filter((i) => i.uuid !== uuid),
        currentInvoice: state.currentInvoice?.uuid === uuid ? null : state.currentInvoice,
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to delete invoice ${uuid}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      throw new Error(errorMsg);
    }
  },

  issueInvoice: async (invoiceUuid, userUuid) => {
      set({ isLoading: true, error: null });
      try {
          await api.post(`/finances/invoices/${invoiceUuid}/confirm`, null, {
              params: { user_uuid: userUuid }
          });
          // After issuing, re-fetch to get updated status and stock adjustments
          const { data } = await api.get<Invoice>(`${resource}/${invoiceUuid}`);
          set((state) => ({
              invoices: state.invoices.map((i) => (i.uuid === invoiceUuid ? data : i)),
              currentInvoice: data,
              isLoading: false,
          }));
      } catch (e: any) {
          const errorMsg = e.response?.data?.error || e.message || "Failed to issue invoice";
          set({ error: errorMsg, isLoading: false });
          throw new Error(errorMsg);
      }
  }
}));

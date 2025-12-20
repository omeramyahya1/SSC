// src/store/useDocumentStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Document {
  doc_id: number;
  project_id: number;
  date_created: string;
  last_edited_date: string;
  doc_type: "Invoice" | "Project Breakdown";
  file_name: string;
  file_blob: string; // Representing LargeBinary as a base64 string
}

export type NewDocumentData = Omit<Document, 'doc_id' | 'date_created' | 'last_edited_date'>;

const resource = '/documents';

// --- 2. Define Store ---

export interface DocumentStore {
  documents: Document[];
  currentDocument: Document | null;
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  fetchDocument: (id: number) => Promise<void>;
  createDocument: (data: NewDocumentData) => Promise<Document | undefined>;
  updateDocument: (id: number, data: Partial<NewDocumentData>) => Promise<Document | undefined>;
  deleteDocument: (id: number) => Promise<void>;
  setCurrentDocument: (doc: Document | null) => void;
}

export const useDocumentStore = create<DocumentStore>((set) => ({
  documents: [],
  currentDocument: null,
  isLoading: false,
  error: null,

  setCurrentDocument: (doc) => {
    set({ currentDocument: doc });
  },

  fetchDocuments: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Document[]>(resource);
      set({ documents: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch documents";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchDocument: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Document>(`${resource}/${id}`);
      set({ currentDocument: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch document ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createDocument: async (newDocumentData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Document>(resource, newDocumentData);
      set((state) => ({ documents: [...state.documents, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create document";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateDocument: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Document>(`${resource}/${id}`, updatedData);
      set((state) => ({
        documents: state.documents.map((d) => (d.doc_id === id ? data : d)),
        currentDocument: state.currentDocument?.doc_id === id ? data : state.currentDocument,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update document ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteDocument: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        documents: state.documents.filter((d) => d.doc_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete document ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));
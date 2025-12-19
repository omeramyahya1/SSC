// src/api/documentService.ts
import api from './client';

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

export const documentService = {
  /**
   * Fetches all documents from the backend.
   */
  getAll: async (): Promise<Document[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single document by its ID.
   * @param id The ID of the document to fetch.
   */
  getById: async (id: number): Promise<Document> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new document.
   * @param newDocumentData The data for the new document.
   */
  create: async (newDocumentData: NewDocumentData): Promise<Document> => {
    const { data } = await api.post(resource, newDocumentData);
    return data;
  },

  /**
   * Updates an existing document.
   * @param id The ID of the document to update.
   * @param updatedData The new data for the document.
   */
  update: async (id: number, updatedData: Partial<NewDocumentData>): Promise<Document> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a document by its ID.
   * @param id The ID of the document to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};

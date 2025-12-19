// src/store/useDocumentStore.ts
import { documentService, Document, NewDocumentData } from '@/api/documentService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing document data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `documentService`.
 */
export const useDocumentStore = createCrudStore<Document, NewDocumentData>(documentService);

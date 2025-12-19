// src/store/useProjectStore.ts
import { projectService, Project, NewProjectData } from '@/api/projectService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing project data.
 *
 * This store is created using the generic `createCrudStore` factory
 * and powered by the `projectService`.
 */
export const useProjectStore = createCrudStore<Project, NewProjectData>(projectService);

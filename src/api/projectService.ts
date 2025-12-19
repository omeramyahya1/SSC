// src/api/projectService.ts
import api from './client';

export interface Project {
  project_id: number;
  date_created: string;
  last_edited_date: string;
  customer_id: number;
  status: "planning" | "execution" | "done" | "archived";
  system_config_id: number;
  user_id: number;
  org_id?: number | null;
  project_location?: string | null;
}

export type NewProjectData = Omit<Project, 'project_id' | 'date_created' | 'last_edited_date'>;

const resource = '/projects';

export const projectService = {
  /**
   * Fetches all projects from the backend.
   */
  getAll: async (): Promise<Project[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single project by its ID.
   * @param id The ID of the project to fetch.
   */
  getById: async (id: number): Promise<Project> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new project.
   * @param newProjectData The data for the new project.
   */
  create: async (newProjectData: NewProjectData): Promise<Project> => {
    const { data } = await api.post(resource, newProjectData);
    return data;
  },

  /**
   * Updates an existing project.
   * @param id The ID of the project to update.
   * @param updatedData The new data for the project.
   */
  update: async (id: number, updatedData: Partial<NewProjectData>): Promise<Project> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a project by its ID.
   * @param id The ID of the project to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};

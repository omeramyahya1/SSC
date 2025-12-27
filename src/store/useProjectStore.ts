// src/store/useProjectStore.ts
import { create } from 'zustand';
import api from '@/api/client';

// --- 1. Define Types ---

export interface Project {
  project_id: number;
  created_at: string;
  updated_at: string;
  is_dirty: boolean;
  customer_id: number;
  status: "planning" | "execution" | "done" | "archived";
  system_config_id: number;
  user_id: number;
  org_id?: number | null;
  project_location?: string | null;
}

export type NewProjectData = Omit<Project, 'project_id' | 'created_at' | 'updated_at' | 'is_dirty'>;

const resource = '/projects';

// --- 2. Define Store ---

export interface ProjectStore {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  fetchProject: (id: number) => Promise<void>;
  createProject: (data: NewProjectData) => Promise<Project | undefined>;
  updateProject: (id: number, data: Partial<NewProjectData>) => Promise<Project | undefined>;
  deleteProject: (id: number) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  isLoading: false,
  error: null,

  setCurrentProject: (project) => {
    set({ currentProject: project });
  },

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Project[]>(resource);
      set({ projects: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || "Failed to fetch projects";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  fetchProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<Project>(`${resource}/${id}`);
      set({ currentProject: data, isLoading: false });
    } catch (e: any) {
      const errorMsg = e.message || `Failed to fetch project ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },

  createProject: async (newProjectData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<Project>(resource, newProjectData);
      set((state) => ({ projects: [...state.projects, data], isLoading: false }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || "Failed to create project";
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  updateProject: async (id, updatedData) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.put<Project>(`${resource}/${id}`, updatedData);
      set((state) => ({
        projects: state.projects.map((p) => (p.project_id === id ? data : p)),
        currentProject: state.currentProject?.project_id === id ? data : state.currentProject,
        isLoading: false,
      }));
      return data;
    } catch (e: any) {
      const errorMsg = e.message || `Failed to update project ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
      return undefined;
    }
  },

  deleteProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`${resource}/${id}`);
      set((state) => ({
        projects: state.projects.filter((p) => p.project_id !== id),
        isLoading: false,
      }));
    } catch (e: any) {
      const errorMsg = e.message || `Failed to delete project ${id}`;
      set({ error: errorMsg, isLoading: false });
      console.error(errorMsg, e);
    }
  },
}));
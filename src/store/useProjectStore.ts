// src/store/useProjectStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { NewProjectData } from '@/pages/dashboard/CreateProjectModal';

// --- 1. Define Types ---

// This interface now reflects the nested customer object from the backend
export interface Customer {
    customer_id: number;
    uuid: string;
    full_name: string;
    phone_number?: string | null;
    email?: string | null;
}
export interface Project {
    project_id: number;
    uuid: string;
    customer_uuid: string;
    status: "planning" | "execution" | "done" | "archived";
    project_location?: string | null;
    created_at: string;
    updated_at: string;
    
    // Nested customer data from the API
    customer: Customer;

    // For optimistic UI
    is_pending?: boolean;
}

const resource = '/projects';

// --- 2. Define Store ---

export interface ProjectStore {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (data: NewProjectData) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,

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

  createProject: async (newProjectData) => {
    // Optimistic UI: Create a temporary project object
    const tempId = -Date.now(); // Unique negative ID
    const optimisticProject: Project = {
        project_id: tempId,
        uuid: String(tempId),
        customer_uuid: String(tempId),
        status: 'planning',
        project_location: newProjectData.project_location,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customer: {
            customer_id: tempId,
            uuid: String(tempId),
            full_name: newProjectData.customer_name,
            email: newProjectData.email,
            phone_number: newProjectData.phone_number
        },
        is_pending: true,
    };

    // Immediately update the UI with the temporary project
    set((state) => ({ projects: [optimisticProject, ...state.projects] }));

    try {
        // Make the actual API call
        const { data: finalProject } = await api.post<Project>(`${resource}/create_with_customer`, newProjectData);

        // On success, replace the temporary project with the real one from the server
        set((state) => ({
            projects: state.projects.map((p) => (p.project_id === tempId ? finalProject : p)),
        }));
    } catch (e: any) {
        const errorMsg = e.message || "Failed to create project";
        // On failure, remove the temporary project and set an error
        set((state) => ({
            error: errorMsg,
            projects: state.projects.filter((p) => p.project_id !== tempId),
        }));
        console.error(errorMsg, e);
        // Optionally: throw the error so the UI component can react (e.g., show a toast)
        throw e;
    }
  },
}));

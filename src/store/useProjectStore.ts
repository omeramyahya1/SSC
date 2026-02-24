// src/store/useProjectStore.ts
import { create } from 'zustand';
import api from '@/api/client';
import { NewProjectData, QuickCalcConvertedData } from '@/pages/dashboard/CreateProjectModal';
import { SystemConfiguration } from './useSystemConfigurationStore';

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
    deleted_at?: string | null;
    system_config?: SystemConfiguration;

    // Nested customer data from the API
    customer: Customer;

    // For optimistic UI
    is_pending?: boolean;
}

export type ProjectUpdatePayload = Partial<{
    project_location: string;
    full_name: string;
    email: string;
    phone_number: string;
}>;


const resource = '/projects';

// --- 2. Define Store ---

export interface ProjectStore {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  _quickCalcProjectId: string | null; // Internal state to store the quick calc project ID
  fetchProjects: () => Promise<void>;
  createProject: (data: NewProjectData, quickCalcData?: QuickCalcConvertedData) => Promise<void>;
  updateProject: (projectUuid: string, data: ProjectUpdatePayload) => Promise<Project>;
  updateProjectStatus: (projectUuid: string, status: Project['status']) => Promise<void>;
  softDeleteProject: (projectUuid: string) => Promise<void>;
  recoverProject: (projectUuid: string) => Promise<void>;
  archiveProject: (projectUuid: string) => Promise<void>;
  deleteProjectPermanently: (projectUuid: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  getQuickCalcProjectId: () => Promise<string>; // New action
  receiveProjectUpdate: (updatedProject: Project) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  isLoading: false,
  error: null,
  _quickCalcProjectId: null, // Initialize internal state

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

  getQuickCalcProjectId: async () => {
    const { _quickCalcProjectId } = get();
    if (_quickCalcProjectId) {
        return _quickCalcProjectId;
    }
    set({ isLoading: true, error: null });
    try {
        const { data: project } = await api.post<Project>(`${resource}/quick-calc-init`);
        set({ _quickCalcProjectId: project.uuid, isLoading: false });
        return project.uuid;
    } catch (e: any) {
        const errorMsg = e.message || "Failed to get or create Quick Calc project";
        set({ error: errorMsg, isLoading: false });
        console.error(errorMsg, e);
        throw e;
    }
  },

  createProject: async (newProjectData, quickCalcData) => {
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
        // Optimistically add system_config and appliances if available from quick calc
        system_config: quickCalcData?.config ? {
            uuid: String(tempId - 1),
            config_items: quickCalcData.config,
            total_wattage: quickCalcData.config.metadata.total_peak_power_w,
             created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            system_config_id: tempId -1,
        } : undefined,
    };

    set((state) => ({ projects: [optimisticProject, ...state.projects] }));

    try {
        const payload = {
            ...newProjectData,
            appliances: quickCalcData?.appliances,
            system_config: quickCalcData?.config,
        };
        const { data: finalProject } = await api.post<Project>(`${resource}/create_with_customer`, payload);

        set((state) => ({
            projects: state.projects.map((p) => (p.project_id === tempId ? finalProject : p)),
        }));
    } catch (e: any) {
        const errorMsg = e.message || "Failed to create project";
        set((state) => ({
            error: errorMsg,
            projects: state.projects.filter((p) => p.project_id !== tempId),
        }));
        console.error(errorMsg, e);
        throw e;
    }
  },

  updateProject: async (projectUuid: string, data: ProjectUpdatePayload): Promise<Project> => {
    const originalProjects = get().projects;
    const projectToUpdate = originalProjects.find(p => p.uuid === projectUuid);
    if (!projectToUpdate) {
        throw new Error("Project not found for optimistic update.");
    };

    // Optimistic update
    const updatedProject = {
        ...projectToUpdate,
        project_location: data.project_location ?? projectToUpdate.project_location,
        customer: {
            ...projectToUpdate.customer,
            full_name: data.full_name ?? projectToUpdate.customer.full_name,
            email: data.email ?? projectToUpdate.customer.email,
            phone_number: data.phone_number ?? projectToUpdate.customer.phone_number,
        },
        is_pending: true,
    };

    set({
        projects: originalProjects.map(p => p.uuid === projectUuid ? updatedProject : p)
    });

    try {
        const { data: finalProject } = await api.patch<Project>(`${resource}/${projectUuid}`, data);
        // On success, finalize the update
        set(state => ({
            projects: state.projects.map(p => p.uuid === projectUuid ? { ...finalProject, is_pending: false } : p)
        }));
        return finalProject;
    } catch(e: any) {
        const errorMsg = e.message || "Failed to update project";
        // On failure, revert to original state
        set({ projects: originalProjects, error: errorMsg });
        console.error(errorMsg, e);
        throw e;
    }
  },

  updateProjectStatus: async (projectUuid: string, status: Project['status']) => {
    const originalProjects = get().projects;
    const projectToUpdate = originalProjects.find(p => p.uuid === projectUuid);
    if (!projectToUpdate) {
        console.error("Project not found for status update.");
        return;
    }

    // Optimistic update
    set(state => ({
        projects: state.projects.map(p =>
            p.uuid === projectUuid ? { ...p, status, is_pending: true } : p
        ),
    }));

    try {
        const { data: finalProject } = await api.patch<Project>(`${resource}/${projectUuid}/status`, { status });
        // On success, finalize the update
         set(state => ({
            projects: state.projects.map(p => p.uuid === projectUuid ? { ...finalProject, is_pending: false } : p)
        }));
         // Also update the project in the modal if it's open
        get().receiveProjectUpdate(finalProject);
    } catch (e: any) {
        const errorMsg = e.message || "Failed to update project status";
        console.error(errorMsg, e);
        // On failure, revert to original state
        set({ projects: originalProjects, error: errorMsg });
    }
  },

  softDeleteProject: async (projectUuid: string) => {
    const originalProjects = get().projects;
    set(state => ({
        projects: state.projects.map(p =>
            p.uuid === projectUuid ? { ...p, deleted_at: new Date().toISOString(), is_pending: true } : p
        ),
    }));

    try {
        const { data: result } = await api.delete(`${resource}/${projectUuid}`);
        set(state => ({
            projects: state.projects.map(p =>
                p.uuid === projectUuid ? { ...p, deleted_at: result.deleted_at, is_pending: false } : p
            )
        }));
    } catch (e: any) {
        console.error("Failed to soft delete project:", e);
        set({ projects: originalProjects });
    }
  },

  recoverProject: async (projectUuid: string) => {
    const originalProjects = get().projects;
    set(state => ({
        projects: state.projects.map(p =>
            p.uuid === projectUuid ? { ...p, deleted_at: null, is_pending: true } : p
        ),
    }));

    try {
        await api.patch(`${resource}/${projectUuid}/recover`);
        set(state => ({
            projects: state.projects.map(p =>
                p.uuid === projectUuid ? { ...p, is_pending: false } : p
            )
        }));
    } catch (e: any) {
        console.error("Failed to recover project:", e);
        set({ projects: originalProjects });
    }
  },

  archiveProject: async (projectUuid: string) => {
    await get().updateProjectStatus(projectUuid, 'archived');
  },

  deleteProjectPermanently: async (projectUuid: string) => {
    const originalProjects = get().projects;
    // Optimistically remove the project from the UI
    set(state => ({
        projects: state.projects.filter(p => p.uuid !== projectUuid),
    }));

    try {
        await api.delete(`${resource}/${projectUuid}/permanent`);
        // If API succeeds, state is already updated.
    } catch (e: any) {
        const errorMsg = e.message || "Failed to permanently delete project";
        console.error(errorMsg, e);
        // On failure, revert to the original state
        set({ projects: originalProjects, error: errorMsg });
        throw e; // Re-throw to be caught by the UI layer for feedback
    }
  },

  emptyTrash: async () => {
    const originalProjects = get().projects;
    const projectsToKeep = originalProjects.filter(p => !p.deleted_at);

    // Optimistically remove all soft-deleted projects
    set({ projects: projectsToKeep });

    try {
        await api.delete(`${resource}/trash/empty`);
        // If API succeeds, state is already updated.
    } catch (e: any) {
        const errorMsg = e.message || "Failed to empty trash";
        console.error(errorMsg, e);
        // On failure, revert to the original state
        set({ projects: originalProjects, error: errorMsg });
        throw e; // Re-throw to be caught by the UI layer for feedback
    }
  },

  receiveProjectUpdate: (updatedProject: Project) => {
    set(state => ({
      projects: state.projects.map(p => p.uuid === updatedProject.uuid ? updatedProject : p),
    }));
  },
}));

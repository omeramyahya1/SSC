import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/ui/empty";
import { ProjectCard } from "./ProjectCard";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { useUserStore } from '@/store/useUserStore';
import { Dialog } from '@/components/ui/dialog';
import { ProjectDetailsModal } from './ProjectDetailsModal';
import { CreateProjectModal, NewProjectData } from './CreateProjectModal';

export interface Project {
    id: number;
    projectName: string;
    customerName: string;
    location: string;
    size: string;
    status: 'Planning' | 'Execution' | 'Done' | 'Archived';
}

const statuses: Array<Project['status']> = ['Planning', 'Execution', 'Done', 'Archived'];

export function MainContent() {
    const { t } = useTranslation();
    const [projects, setProjects] = useState<Project[]>([]);
    const { currentUser } = useUserStore();
    const isExpired = currentUser?.status === 'expired';
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const handleCreateProject = (projectData: NewProjectData) => {
        const newId = projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1;
        const newProject: Project = {
            id: newId,
            ...projectData,
            status: 'Planning', // Default status for new projects
        };
        setProjects(prev => [newProject, ...prev]);
        setIsCreateModalOpen(false); // Close modal on creation
    };

    const openProjectModal = (project: Project) => {
        setSelectedProject(project);
    };

    const closeProjectModal = () => {
        setSelectedProject(null);
    }

    return (
        <>
            <Dialog open={!!selectedProject} onOpenChange={(isOpen) => !isOpen && closeProjectModal()}>
                <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
                    <SubscriptionBanner />
                    <div className="p-6">
                        {/* Toolbar */}
                        <div className="flex items-center justify-between mb-6">
                            <h1 className="text-2xl font-bold">{t('dashboard.projects', 'Projects')}</h1>
                            <div className="flex items-center gap-2">
                                <Input placeholder={t('dashboard.search', 'Search...')} className="w-64 bg-white" />
                                {/* Filters would go here, e.g., using Select components */}
                                <Button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    disabled={isExpired}
                                    className="text-white hover:shadow-lg"
                                    >
                                    <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert" />
                                    {t('dashboard.create_project', 'Create New Project')}
                                </Button>
                            </div>
                        </div>

                        {/* Content */}
                        {projects.length === 0 ? (
                            <Empty className="mt-5">
                                <img src='/illustrations/no-projects.png' className='w-1/4'/>
                                <div className="text-center">
                                    <h3 className="text-xl font-semibold">{t('dashboard.no_projects_title', 'No Projects Yet')}</h3>
                                    <p className="text-muted-foreground mt-2 mb-4">{t('dashboard.no_projects_desc', 'Get started by creating your first project.')}</p>
                                    <Button
                                        onClick={() => setIsCreateModalOpen(true)}
                                        disabled={isExpired}
                                        className='text-white hover:shadow-lg rounded-md'
                                        >
                                        {t('dashboard.create_project', 'Create New Project')}
                                    </Button>
                                </div>
                            </Empty>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {projects.map(p => <ProjectCard key={p.id} project={p} onOpen={() => openProjectModal(p)} />)}
                            </div>
                        )}
                    </div>
                    <ProjectDetailsModal project={selectedProject} />
                </main>
            </Dialog>
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <CreateProjectModal onSubmit={handleCreateProject} onOpenChange={setIsCreateModalOpen} />
            </Dialog>
        </>
    );
}
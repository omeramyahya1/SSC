import { useState, useEffect } from 'react';
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
import { useProjectStore, Project } from '@/store/useProjectStore';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function MainContent() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const isExpired = currentUser?.status === 'expired';

    // State for modals
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Zustand store integration
    const { projects, isLoading, error, fetchProjects, createProject } = useProjectStore();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleCreateProject = async (projectData: NewProjectData) => {
        try {
            await createProject(projectData);
            setIsCreateModalOpen(false); // Close modal on success
        } catch (e) {
            // Error is handled in the store, but you could add toast notifications here
            console.error("Failed to create project from UI:", e);
        }
    };

    const openProjectModal = (project: Project) => {
        setSelectedProject(project);
    };

    const closeProjectModal = () => {
        setSelectedProject(null);
    }

    const renderContent = () => {
        if (isLoading && projects.length === 0) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Spinner className="w-12 h-12" />
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Alert variant="destructive" className="max-w-md">
                        <AlertTitle>{t('dashboard.error_title', 'Failed to Load Projects')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                </div>
            );
        }

        if (projects.length === 0) {
            return (
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
                            <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert ltr:mr-2 rtl:ml-2" />
                            <span>{t('dashboard.create_project', 'Create New Project')}</span>
                        </Button>
                    </div>
                </Empty>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {projects.map(p => <ProjectCard key={p.project_id} project={p} onOpen={() => openProjectModal(p)} />)}
            </div>
        );
    };

    return (
        <>
            <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
                <SubscriptionBanner />
                <div className="p-6">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-2xl font-bold">{t('dashboard.projects', 'Projects')}</h1>
                        <div className="flex items-center gap-2">
                             <div className="relative">
                                <img src="/eva-icons (2)/outline/search.png" alt="search" className="w-5 h-5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input placeholder={t('dashboard.search', 'Search...')} className="w-64 bg-white ltr:pl-10 rtl:pr-10" />
                            </div>
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                disabled={isExpired}
                                className="text-white hover:shadow-lg"
                                >
                                <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert ltr:mr-2 rtl:ml-2" />
                                <span>{t('dashboard.create_project', 'Create New Project')}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    {renderContent()}
                </div>
            </main>
            
            {/* Modals */}
            <Dialog open={!!selectedProject} onOpenChange={(isOpen) => !isOpen && closeProjectModal()}>
                <ProjectDetailsModal project={selectedProject} />
            </Dialog>
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                <CreateProjectModal onSubmit={handleCreateProject} onOpenChange={setIsCreateModalOpen} />
            </Dialog>
        </>
    );
}
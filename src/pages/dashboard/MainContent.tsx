import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/ui/empty";
import { ProjectCard } from "./ProjectCard";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { useUserStore } from '@/store/useUserStore';

interface Project {
    id: number;
    name: string;
    customerName: string;
    size: string;
    status: string;
}

export function MainContent() {
    const { t } = useTranslation();
    const [projects, setProjects] = useState<Project[]>([]);
    const { currentUser } = useUserStore();
    const isExpired = currentUser?.status === 'expired';

    const createNewProject = () => {
        if (isExpired) return;
        const newProject: Project = {
            id: projects.length + 1,
            name: `Project ${projects.length + 1}`,
            customerName: `Customer ${projects.length + 1}`,
            size: '5 kW',
            status: 'Planning'
        };
        setProjects(prev => [...prev, newProject]);
    };

    return (
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
                            onClick={createNewProject}
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
                                onClick={createNewProject}
                                disabled={isExpired}
                                className='text-white hover:shadow-lg rounded-md'
                                >
                                {t('dashboard.create_project', 'Create New Project')}
                            </Button>
                        </div>
                    </Empty>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map(p => <ProjectCard key={p.id} project={p} />)}
                    </div>
                )}
            </div>
        </main>
    );
}

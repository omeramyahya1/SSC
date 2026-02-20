import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/ui/empty";
import { ProjectCard } from "./ProjectCard";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { useUserStore } from '@/store/useUserStore';
import { Dialog } from '@/components/ui/dialog';
import { ProjectDetailsModal } from './ProjectDetailsModal';
import { CreateProjectModal, NewProjectData, QuickCalcConvertedData } from './CreateProjectModal';
import { QuickCalculateModal } from './QuickCalculateModal';
import { useProjectStore, Project } from '@/store/useProjectStore';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectAppliance } from '@/store/useApplianceStore';
import { BleCalculationResults } from '@/store/useBleStore';

type ViewMode = 'active' | 'trash' | 'archived';
type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'location';
type GroupOption = 'none' | 'status' | 'date' | 'location' | 'customer';

export function MainContent() {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const isExpired = currentUser?.status === 'expired';

    // State for views and filters
    const [currentView, setCurrentView] = useState<ViewMode>('active');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [groupBy, setGroupBy] = useState<GroupOption>('none');

    // State for modals
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isQuickCalcOpen, setIsQuickCalcOpen] = useState(false);
    const [quickCalcData, setQuickCalcData] = useState<any>(null); // State to pass data from QuickCalc to CreateProject

    // Zustand store integration
    const { projects, isLoading, error, fetchProjects, createProject, createProjectWithConfig } = useProjectStore();

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleCreateProject = async (projectData: NewProjectData, quickCalcConvertedData?: QuickCalcConvertedData) => {
        try {
            if (quickCalcConvertedData && createProjectWithConfig) {
                await createProjectWithConfig(projectData, quickCalcConvertedData);
            } else {
                await createProject(projectData);
            }
            setIsCreateModalOpen(false);
            setQuickCalcData(null); // Clear quickCalcData after project creation
        } catch (e) {
            console.error("Failed to create project from UI:", e);
        }
    };

    const handleConvertQuickCalcToProject = (data: QuickCalcConvertedData) => {
        setQuickCalcData(data); // Save the quick calc data
        setIsQuickCalcOpen(false); // Close quick calc modal
        setIsCreateModalOpen(true); // Open create project modal
    };

    const openProjectModal = (project: Project) => {
        setSelectedProject(project);
    };

    const closeProjectModal = () => {
        setSelectedProject(null);
    }

    // --- Filtering & Sorting Logic ---

    const filteredProjects = useMemo(() => {
        return projects.filter(p => {
            // View filter
            if (currentView === 'active') {
                if (p.deleted_at || p.status === 'archived') return false;
            } else if (currentView === 'trash') {
                if (!p.deleted_at) return false;
            } else if (currentView === 'archived') {
                if (p.deleted_at || p.status !== 'archived') return false;
            }

            // Status filter (only for active view)
            if (currentView === 'active' && filterStatus !== 'all' && p.status !== filterStatus) return false;

            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const nameMatch = p.customer.full_name.toLowerCase().includes(query);
                const locationMatch = p.project_location?.toLowerCase().includes(query);
                const idMatch = String(p.project_id).includes(query);
                if (!nameMatch && !locationMatch && !idMatch) return false;
            }

            return true;
        }).sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (sortBy === 'name-asc') return a.customer.full_name.localeCompare(b.customer.full_name);
            if (sortBy === 'name-desc') return b.customer.full_name.localeCompare(a.customer.full_name);
            if (sortBy === 'location') return (a.project_location || '').localeCompare(b.project_location || '');
            return 0;
        });
    }, [projects, currentView, searchQuery, sortBy, filterStatus]);

    // --- Grouping Logic ---

    const groupedProjects = useMemo(() => {
        if (groupBy === 'none') return { 'All Projects': filteredProjects };

        const groups: Record<string, Project[]> = {};

        filteredProjects.forEach(p => {
            let key = '';
            if (groupBy === 'status') key = t(`dashboard.status.${p.status}`, p.status);
            else if (groupBy === 'location') key = p.project_location || t('dashboard.no_location', 'No Location');
            else if (groupBy === 'customer') key = p.customer.full_name;
            else if (groupBy === 'date') {
                const date = new Date(p.created_at);
                key = date.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long' });
            }

            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });

        return groups;
    }, [filteredProjects, groupBy, t, i18n.language]);

    const renderGrid = (items: Project[]) => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map(p => (
                <ProjectCard
                    key={p.project_id}
                    project={p}
                    onOpen={() => openProjectModal(p)}
                    viewMode={currentView}
                />
            ))}
        </div>
    );

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

        if (filteredProjects.length === 0) {
            const emptyTitle = currentView === 'trash' ? t('dashboard.empty_trash_title', 'Trash is Empty') :
                              currentView === 'archived' ? t('dashboard.empty_archive_title', 'No Archived Projects') :
                              t('dashboard.no_projects_title', 'No Projects Found');

            const emptyDesc = searchQuery ? t('dashboard.no_search_results', 'No projects match your search criteria.') :
                             currentView === 'trash' ? t('dashboard.empty_trash_desc', 'Deleted projects will appear here.') :
                             currentView === 'archived' ? t('dashboard.empty_archive_desc', 'Archived projects will appear here.') :
                             t('dashboard.no_projects_desc', 'Get started by creating your first project.');

            return (
                <Empty className="mt-5">
                    <img src='/illustrations/no-projects.png' className='w-1/4' alt="empty"/>
                    <div className="text-center">
                        <h3 className="text-xl font-semibold">{emptyTitle}</h3>
                        <p className="text-muted-foreground mt-2 mb-4">{emptyDesc}</p>
                        {currentView === 'active' && !searchQuery && (
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                disabled={isExpired}
                                className='text-white hover:shadow-lg rounded-md'
                                >
                                <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert ltr:mr-2 rtl:ml-2" />
                                <span>{t('dashboard.create_project', 'Create New Project')}</span>
                            </Button>
                        )}
                    </div>
                </Empty>
            );
        }

        return (
            <div className="space-y-8">
                {Object.entries(groupedProjects).map(([groupName, items]) => (
                    <div key={groupName} className="space-y-4">
                        {groupBy !== 'none' && (
                            <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm py-2 border-b">
                                <h2 className="text-lg font-bold text-gray-700">{groupName} ({items.length})</h2>
                            </div>
                        )}
                        {renderGrid(items)}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            <main className="flex-1 flex flex-col bg-gray-50 overflow-y-auto" dir={i18n.dir()}>
                <SubscriptionBanner />
                <div className="p-6">
                    {/* Toolbar */}
                    <div className="flex flex-col gap-4 mb-6">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center justify-between w-full">
                                <h1 className="text-3xl font-bold">
                                    {currentView === 'active' ? t('dashboard.projects', 'Projects') :
                                     currentView === 'trash' ? t('dashboard.trash', 'Trash') :
                                     t('dashboard.archive', 'Archive')}
                                </h1>
                                <div className="flex bg-white border rounded-lg p-1 shadow-sm">
                                    <Button
                                        variant={currentView === 'active' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className={`h-8 rounded-md font-bold ${currentView === 'active' ? 'bg-primary text-white' : 'ghost'}`}
                                        onClick={() => setCurrentView('active')}
                                    >
                                        {t('dashboard.home', 'Home')}
                                    </Button>
                                    <Button
                                        variant={currentView === 'archived' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className={`h-8 rounded-md font-bold ${currentView === 'archived' ? 'bg-primary text-white' : 'ghost'}`}
                                        onClick={() => setCurrentView('archived')}
                                    >
                                        <img src="/eva-icons (2)/outline/archive.png" alt="archive" className={`w-4 h-4 ltr:mr-2 rtl:ml-2 ${currentView === 'archived' ? 'invert' : 'opacity-70'}`} />
                                        {t('dashboard.view_archived', 'Archived')}
                                    </Button>
                                    <Button
                                        variant={currentView === 'trash' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        className={`h-8 rounded-md font-bold ${currentView === 'trash' ? 'bg-primary text-white' : 'ghost'}`}
                                        onClick={() => setCurrentView('trash')}
                                    >
                                        <img src="/eva-icons (2)/outline/trash-2.png" alt="trash" className={`w-4 h-4 ltr:mr-2 rtl:ml-2 ${currentView === 'trash' ? 'invert' : 'opacity-70'}`} />
                                        {t('dashboard.view_trash', 'Trash')}
                                    </Button>
                                </div>
                            </div>
                            <Button
                                onClick={() => setIsQuickCalcOpen(true)}
                                disabled={isExpired}
                                className="group hover:shadow-lg h bg-white hover:bg-primary border  shadow-sm "
                                >
                                <img src="/eva-icons (2)/outline/flash.png" alt="quick calc" className="w-5 h-5 group-hover:invert me-2" />
                                <span className='me-2 group-hover:text-white'>{t('dashboard.quick_calc', 'Quick Calculate')}</span>
                            </Button>
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                disabled={isExpired || currentView !== 'active'}
                                className="text-white hover:shadow-lg "
                                >
                                <img src="/eva-icons (2)/outline/plus-square.png" alt="add" className="w-5 h-5 invert me-2" />
                                <span className='me-2'>{t('dashboard.create_project', 'Create New Project')}</span>
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            {/* Search */}
                            <div className="relative flex-grow max-w-md">
                                <img src="/eva-icons (2)/outline/search.png" alt="search" className="w-5 h-5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground opacity-60" />
                                <Input
                                    placeholder={t('dashboard.search_ph', 'Search by name, location...')}
                                    className="bg-white ltr:pl-10 rtl:pr-10 border-gray-200"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button
                                        className="absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        onClick={() => setSearchQuery('')}
                                    >
                                        <img src="/eva-icons (2)/outline/close.png" alt="clear" className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Sort */}
                                <Select value={sortBy} onValueChange={(v: SortOption) => setSortBy(v)}>
                                    <SelectTrigger className={`w-auto border-gray-200 flex gap-2 ${sortBy !== "newest" ? "bg-primary text-white" : "bg-white"}`}>
                                        <img src="/eva-icons (2)/outline/swap.png" alt="sort" className={`w-4 h-4 rotate-90 ${sortBy !== "newest" ? "invert" : "opacity-60"}`} />
                                        <SelectValue placeholder={t('dashboard.sort_by', 'Sort by')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="newest">{t('dashboard.sort.newest', 'Newest First')}</SelectItem>
                                        <SelectItem value="oldest">{t('dashboard.sort.oldest', 'Oldest First')}</SelectItem>
                                        <SelectItem value="name-asc">{t('dashboard.sort.name_asc', 'Name A-Z')}</SelectItem>
                                        <SelectItem value="name-desc">{t('dashboard.sort.name_desc', 'Name Z-A')}</SelectItem>
                                        <SelectItem value="location">{t('dashboard.sort.location', 'Location')}</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Filter Status (only in Active view) */}
                                {currentView === 'active' && (
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className={`w-auto bg-white border-gray-200 flex gap-2 ${filterStatus !== "all" ? "bg-primary text-white" : "bg-white"}`}>
                                            <img src="/eva-icons (2)/outline/funnel.png" alt="filter" className={`w-4 h-4 ${filterStatus !== "all" ? "invert" : "opacity-60"}`} />
                                            <SelectValue placeholder={t('dashboard.filter', 'Filter')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">{t('dashboard.filter.all', 'All Status')}</SelectItem>
                                            <SelectItem value="planning">{t('dashboard.status.planning', 'Planning')}</SelectItem>
                                            <SelectItem value="execution">{t('dashboard.status.execution', 'Execution')}</SelectItem>
                                            <SelectItem value="done">{t('dashboard.status.done', 'Done')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}

                                {/* Group By */}
                                <Select value={groupBy} onValueChange={(v: GroupOption) => setGroupBy(v)}>
                                    <SelectTrigger className={`w-auto bg-white border-gray-200 flex gap-2 ${groupBy !== "none" ? "bg-primary text-white" : "bg-white"}`}>
                                        <img src="/eva-icons (2)/outline/layers.png" alt="group" className={`w-4 h-4 ${groupBy !== "none" ? "invert" : "opacity-60"}`} />
                                        <SelectValue placeholder={t('dashboard.group_by', 'Group by')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('dashboard.group.none', 'No Grouping')}</SelectItem>
                                        <SelectItem value="status">{t('dashboard.group.status', 'Status')}</SelectItem>
                                        <SelectItem value="date">{t('dashboard.group.date', 'Month Created')}</SelectItem>
                                        <SelectItem value="location">{t('dashboard.group.location', 'Location')}</SelectItem>
                                        <SelectItem value="customer">{t('dashboard.group.customer', 'Customer')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
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
                <CreateProjectModal onSubmit={handleCreateProject} onOpenChange={setIsCreateModalOpen} initialData={quickCalcData} />
            </Dialog>
            <Dialog open={isQuickCalcOpen} onOpenChange={setIsQuickCalcOpen} >
                <QuickCalculateModal onConvert={handleConvertQuickCalcToProject} onOpenChange={setIsQuickCalcOpen}/>
            </Dialog>
        </>
    );
}

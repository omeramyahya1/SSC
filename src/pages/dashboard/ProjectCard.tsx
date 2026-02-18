import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { Project, useProjectStore } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { useLocationData } from "@/hooks/useLocationData";

interface ProjectCardProps {
    project: Project;
    onOpen: () => void;
    viewMode?: 'active' | 'trash' | 'archived';
}

const statusColors: { [key: string]: string } = {
    'planning': 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    'execution': 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    'done': 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    'archived': 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200',
};

export function ProjectCard({ project, onOpen, viewMode = 'active' }: ProjectCardProps) {
    const { t, i18n } = useTranslation();
    const { getClimateDataForCity } = useLocationData();
    const { archiveProject, softDeleteProject, recoverProject } = useProjectStore();

    const formatProjectLocation = (location: string | null) => {
        if (!location) return '';
        const [city, state] = location.split(',').map(s => s.trim());
        const locationData = getClimateDataForCity(city, state);

        if (i18n.language === 'ar' && locationData) {
            return `${locationData.city_ar}, ${locationData.state_ar}`;
        }

        return [city, state].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const displayLocation = formatProjectLocation(String(project.project_location));

    const handleArchive = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await archiveProject(project.uuid);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await softDeleteProject(project.uuid);
    };

    const handleRecover = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await recoverProject(project.uuid);
    };

    return (
        <Card
            className={cn(
                "rounded-lg shadow-md hover:shadow-xl transition-all duration-300 bg-white flex flex-col overflow-hidden cursor-pointer relative",
                project.is_pending && "opacity-60",
                viewMode === 'trash' && "cursor-default"
            )}
            onClick={() => viewMode !== 'trash' && onOpen()}
        >
            <CardHeader className="flex flex-row items-start justify-between p-4">
                <div className="flex-grow overflow-hidden">
                    <CardTitle className="text-lg font-bold truncate" title={project.customer.full_name}>{project.customer.full_name}</CardTitle>
                    <div className="flex flex-col gap-1 pt-1">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                            <img src="/eva-icons (2)/outline/pin.png" alt="location" className="w-4 h-4 opacity-70 flex-shrink-0"/>
                            <p className="truncate" title={displayLocation}>{displayLocation}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                            <img src="/eva-icons (2)/outline/calendar.png" alt="date" className="w-3.5 h-3.5 opacity-70 flex-shrink-0"/>
                            <p>{formatDate(project.created_at)}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ltr:right-0 rtl:left-0">
                    <Badge style={{ backgroundColor: '#E2E2E2', color: '#1F1F1F' }} className="h-6">
                        #{project.project_id > 0 ? project.project_id : '...'}
                    </Badge>

                    {viewMode === 'trash' ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleRecover} title={t('dashboard.recover', 'Recover')}>
                            <img src="/eva-icons (2)/outline/undo.png" alt="recover" className="w-5 h-5" />
                        </Button>
                    ) : (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                    <img src="/eva-icons (2)/outline/more-vertical.png" alt="options" className="w-5 h-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white"
                                >
                                {project.status !== 'archived' && (
                                    <DropdownMenuItem className="cursor-pointer rounded-lg hover:bg-gray-100" onClick={handleArchive}>
                                        <img src="/eva-icons (2)/outline/archive.png" alt="archive" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                                        {t('dashboard.archive', 'Archive')}
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-red-600 cursor-pointer rounded-lg hover:bg-gray-100" onClick={handleDelete}>
                                    <img src="/eva-icons (2)/outline/trash-2.png" alt="delete" className="w-4 h-4 ltr:mr-2 rtl:ml-2 opacity-70" />
                                    {t('dashboard.delete', 'Delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 mt-auto">
                {viewMode !== 'trash' && (
                    <Badge variant="outline" className={cn(`font-semibold`, statusColors[project.status] || 'bg-gray-100')}>
                        {project.is_pending ? t('dashboard.pending', 'Pending...') : t(`dashboard.status.${project.status}`, project.status)}
                    </Badge>
                )}
                {viewMode === 'trash' && (
                    <Badge variant="outline" className="font-semibold bg-red-50 text-red-700 border-red-200">
                        {t('dashboard.deleted', 'Deleted')}
                    </Badge>
                )}
            </CardContent>
        </Card>
    );
}

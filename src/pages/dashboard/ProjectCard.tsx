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
import { Project } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";
import { useLocationData } from "@/hooks/useLocationData";

interface ProjectCardProps {
    project: Project;
    onOpen: () => void;
}

const statusColors: { [key: string]: string } = {
    'planning': 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    'execution': 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    'done': 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    'archived': 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200',
};

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
    const { t, i18n } = useTranslation();
    const { getClimateDataForCity } = useLocationData();

    const formatProjectLocation = (location: string | null) => {
        if (!location) return '';
        const [city, state] = location.split(',').map(s => s.trim());
        const locationData = getClimateDataForCity(city, state);

        if (i18n.language === 'ar' && locationData) {
            return `${locationData.city_ar}, ${locationData.state_ar}`;
        }
        
        return [city, state].filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    };

    const displayLocation = formatProjectLocation(project.project_location);

    return (
        <Card 
            className={cn(
                "rounded-lg shadow-md hover:shadow-xl transition-all duration-300 bg-white flex flex-col overflow-hidden cursor-pointer",
                project.is_pending && "opacity-60"
            )}
            onClick={() => onOpen()}
        >
            <CardHeader className="flex flex-row items-start justify-between p-4">
                <div className="flex-grow overflow-hidden">
                    <CardTitle className="text-lg font-bold truncate" title={project.customer.full_name}>{project.customer.full_name}</CardTitle>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground pt-1 truncate">
                        <img src="/eva-icons (2)/outline/pin.png" alt="location" className="w-4 h-4 opacity-70 flex-shrink-0"/>
                        <p className="truncate" title={displayLocation}>{displayLocation}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ltr:right-0 rtl:left-0">
                    <Badge style={{ backgroundColor: '#E2E2E2', color: '#1F1F1F' }} className="h-6">
                        #{project.project_id > 0 ? project.project_id : '...'}
                    </Badge>
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
                            <DropdownMenuItem className="cursor-pointer rounded-lg hover:bg-gray-100">{t('dashboard.archive', 'Archive')}</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600 cursor-pointer rounded-lg hover:bg-gray-100">{t('dashboard.delete', 'Delete')}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 mt-auto">
                <Badge variant="outline" className={cn(`font-semibold`, statusColors[project.status] || 'bg-gray-100')}>
                    {project.is_pending ? t('dashboard.pending', 'Pending...') : t(`dashboard.status.${project.status}`, project.status)}
                </Badge>
            </CardContent>
        </Card>
    );
}

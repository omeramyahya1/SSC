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

interface ProjectCardProps {
    project: {
        id: number;
        projectName: string;
        customerName: string;
        location: string;
        size: string;
        status: string;
    };
    onOpen: () => void;
}

const statusColors: { [key: string]: string } = {
    'Planning': 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    'Execution': 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    'Done': 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    'Archived': 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200',
};

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
    const { t } = useTranslation();

    return (
        <Card className="rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 bg-white flex flex-col overflow-hidden cursor-pointer" onClick={onOpen}>
            <CardHeader className="flex flex-row items-start justify-between p-4">
                <div className="flex-grow">
                    <CardTitle className="text-lg font-bold truncate">{project.customerName}</CardTitle>
                    <div className="flex items-center gap-1">
                        <img src="/eva-icons (2)/outline/pin.png" alt="size" className="w-4 h-4 opacity-70"/>
                        <p className="text-sm text-muted-foreground pt-1 truncate">{project.location}</p>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-700 mt-2">
                        <img src="/eva-icons (2)/outline/activity.png" alt="size" className="w-4 h-4 opacity-70" />
                        <span className="font-bold">{project.size}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge style={{ backgroundColor: '#E2E2E2', color: '#1F1F1F' }} className="h-6">
                        #{project.id}
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
                <Badge variant="outline" className={`font-semibold ${statusColors[project.status] || 'bg-gray-100'}`}>
                    {project.status}
                </Badge>
            </CardContent>
        </Card>
    );
}

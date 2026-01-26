import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Project } from "@/store/useProjectStore";
import { cn } from "@/lib/utils";

interface ProjectDetailsModalProps {
    project: Project | null;
}

const statusColors: { [key: string]: string } = {
    'planning': 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    'execution': 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    'done': 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    'archived': 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200',
};

export function ProjectDetailsModal({ project }: ProjectDetailsModalProps) {
    const { t } = useTranslation();

    if (!project) {
        return null;
    }

    return (
        <DialogContent className="w-[75vw] max-w-[75vw] h-[75vh] bg-white rounded-lg shadow-2xl backdrop-blur-sm flex flex-col">
            <DialogHeader>
                <DialogTitle className="text-2xl">{project.customer.full_name}'s Project</DialogTitle>
                <DialogDescription>{project.project_location}</DialogDescription>
            </DialogHeader>
            <div className="flex-grow p-6 space-y-4">
                <div>
                    <h3 className="font-semibold">{t('dashboard.customer', 'Customer')}</h3>
                    <p>{project.customer.full_name}</p>
                    {project.customer.email && <p className="text-sm text-muted-foreground">{project.customer.email}</p>}
                    {project.customer.phone_number && <p className="text-sm text-muted-foreground">{project.customer.phone_number}</p>}
                </div>
                <div>
                    <h3 className="font-semibold">{t('dashboard.status', 'Status')}</h3>
                    <Badge variant="outline" className={`font-semibold ${statusColors[project.status] || 'bg-gray-100'}`}>{project.status}</Badge>
                </div>
            </div>
        </DialogContent>
    );
}

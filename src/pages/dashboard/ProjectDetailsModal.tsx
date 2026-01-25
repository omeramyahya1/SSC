import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

interface Project {
    id: number;
    projectName: string;
    customerName: string;
    location: string;
    size: string;
    status: string;
}

interface ProjectDetailsModalProps {
    project: Project | null;
}

export function ProjectDetailsModal({ project }: ProjectDetailsModalProps) {
    const { t } = useTranslation();

    if (!project) {
        return null;
    }

    return (
        <DialogContent className="w-[75vw] max-w-[75vw] h-[75vh] bg-white rounded-lg shadow-2xl backdrop-blur-sm flex flex-col">
            <DialogHeader>
                <DialogTitle className="text-2xl">{project.projectName}</DialogTitle>
                <DialogDescription>{project.location}</DialogDescription>
            </DialogHeader>
            <div className="flex-grow p-6 space-y-4">
                <div>
                    <h3 className="font-semibold">{t('dashboard.customer', 'Customer')}</h3>
                    <p>{project.customerName}</p>
                </div>
                <div>
                    <h3 className="font-semibold">{t('dashboard.status', 'Status')}</h3>
                    <Badge className="text-white">{project.status}</Badge>
                </div>
                <div>
                    <h3 className="font-semibold">{t('dashboard.project_size', 'Project Size')}</h3>
                    <p>{project.size}</p>
                </div>
            </div>
        </DialogContent>
    );
}

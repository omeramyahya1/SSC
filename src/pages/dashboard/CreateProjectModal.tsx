import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface NewProjectData {
    projectName: string;
    customerName: string;
    location: string;
    size: string;
}

interface CreateProjectModalProps {
    onOpenChange: (isOpen: boolean) => void;
    onSubmit: (projectData: NewProjectData) => void;
}

export function CreateProjectModal({ onOpenChange, onSubmit }: CreateProjectModalProps) {
    const { t } = useTranslation();
    const [projectName, setProjectName] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [location, setLocation] = useState('');
    const [size, setSize] = useState('');

    const handleCreate = () => {
        onSubmit({
            projectName,
            customerName,
            location,
            size,
        });
    };

    const isFormValid = projectName.trim() !== '' && customerName.trim() !== '' && location.trim() !== '' && size.trim() !== '';

    return (
        <DialogContent className="sm:max-w-[525px] bg-white">
            <DialogHeader>
                <DialogTitle className="text-2xl font-bold">{t('dashboard.create_project_title', 'Create a New Project')}</DialogTitle>
                <DialogDescription>
                    {t('dashboard.create_project_desc', 'Fill in the details below to create a new project.')}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="grid gap-2">
                    <Label htmlFor="projectName" className="font-semibold">
                        {t('dashboard.project_name_label', 'Project Name')}
                    </Label>
                    <Input id="projectName" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={t('dashboard.project_name_ph', 'e.g. Al-Sail Mall Solar Rooftop')} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="customerName" className="font-semibold">
                        {t('dashboard.customer_name_label', 'Customer Name')}
                    </Label>
                    <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('dashboard.customer_name_ph', 'e.g. John Doe')} />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="location" className="font-semibold">
                        {t('dashboard.location_label', 'Project Location')}
                    </Label>
                    <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('dashboard.location_ph', 'e.g. Khartoum, Sudan')} />
                </div>
                 <div className="grid gap-2">
                    <Label htmlFor="size" className="font-semibold">
                        {t('dashboard.size_label', 'System Size')}
                    </Label>
                    <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} placeholder={t('dashboard.size_ph', 'e.g. 150 kW')} />
                </div>
            </div>
            <DialogFooter>
                <Button onClick={() => onOpenChange(false)} variant="outline">{t('dashboard.cancel', 'Cancel')}</Button>
                <Button onClick={handleCreate} disabled={!isFormValid} className="text-white">{t('dashboard.create_button', 'Create Project')}</Button>
            </DialogFooter>
        </DialogContent>
    );
}

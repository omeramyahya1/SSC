import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranchStore } from '@/store/useBranchStore';
import toast from "react-hot-toast";

interface AddBranchModalProps {
    onOpenChange: (isOpen: boolean) => void;
    organizationUuid: string;
}

export function AddBranchModal({ onOpenChange, organizationUuid }: AddBranchModalProps) {
    const { t, i18n } = useTranslation();
    const { createBranch } = useBranchStore();

    const [formData, setFormData] = useState({
        name: '',
        location: '',
        organization_uuid: organizationUuid
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;

        setIsSubmitting(true);
        try {
            const result = await createBranch(formData);
            if (result) {
                toast.success(t('team.branch_add_success', 'Branch added successfully'));
                onOpenChange(false);
            }
        } catch (e: any) {
            const errorMsg = e.response?.data?.error || t('team.branch_add_error', 'Failed to add branch');
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('team.add_branch_title', 'Add New Branch')}</DialogTitle>
                    <DialogDescription>
                        {t('team.add_branch_desc', 'Enter branch name and location.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="branch_name" className="font-semibold">{t('team.branch_name', 'Branch Name')} *</Label>
                        <Input
                            id="branch_name"
                            value={formData.name}
                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Omdurman Branch"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="location" className="font-semibold">{t('common.location', 'Location')}</Label>
                        <Input
                            id="location"
                            value={formData.location}
                            onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            placeholder="e.g. Khartoum, Sudan"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('team.add_branch', 'Add Branch')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}

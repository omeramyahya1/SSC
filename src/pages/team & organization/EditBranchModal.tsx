import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Branch, useBranchStore } from '@/store/useBranchStore';
import toast from "react-hot-toast";

interface EditBranchModalProps {
    branch: Branch;
    onOpenChange: (isOpen: boolean) => void;
}

export function EditBranchModal({ branch, onOpenChange }: EditBranchModalProps) {
    const { t, i18n } = useTranslation();
    const { updateBranch } = useBranchStore();

    const [formData, setFormData] = useState({
        name: branch.name,
        location: branch.location || '',
    });

    useEffect(() => {
        setFormData({
            name: branch.name,
            location: branch.location || '',
        });
    }, [branch]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;

        setIsSubmitting(true);
        try {
            const result = await updateBranch(branch.branch_id, formData);
            if (result) {
                toast.success(t('team.branch_update_success', 'Branch updated successfully'));
                onOpenChange(false);
            }
        } catch {
            toast.error(t('team.branch_update_error', 'Failed to update branch'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('team.edit_branch_title', 'Edit Branch')}</DialogTitle>
                    <DialogDescription>
                        {t('team.edit_branch_desc', 'Update branch name and location.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="edit_branch_name" className="font-semibold">{t('team.branch_name', 'Branch Name')} *</Label>
                        <Input
                            id="edit_branch_name"
                            value={formData.name}
                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Omdurman Branch"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="edit_location" className="font-semibold">{t('common.location', 'Location')}</Label>
                        <Input
                            id="edit_location"
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
                        {isSubmitting ? t('common.saving', 'Saving...') : t('common.save_changes', 'Save Changes')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Branch, useBranchStore } from '@/store/useBranchStore';
import { useLocationData } from '@/hooks/useLocationData';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
    });

    const [locationState, setLocationState] = useState('');
    const [locationCity, setLocationCity] = useState('');

    const { states, getCitiesByState } = useLocationData();
    const cities = useMemo(() => getCitiesByState(locationState), [locationState, getCitiesByState]);

    useEffect(() => {
        setFormData({
            name: branch.name,
        });

        if (branch.location && branch.location.includes(',')) {
            const [city, state] = branch.location.split(',').map(s => s.trim());
            setLocationState(state);
            setLocationCity(city);
        } else {
            setLocationState('');
            setLocationCity('');
        }
    }, [branch]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !locationState || !locationCity) return;

        setIsSubmitting(true);
        try {
            const result = await updateBranch(branch.branch_id, {
                ...formData,
                location: `${locationCity}, ${locationState}`
            });
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

    const isFormValid = formData.name.trim() !== '' && locationState !== '' && locationCity !== '';

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('team.edit_branch_title', 'Edit Branch')}</DialogTitle>
                    <DialogDescription>
                        {t('team.edit_branch_desc', 'Update branch name and location.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4 space-y-4">
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="locationState" className="font-semibold">
                                {t('dashboard.state_label', 'State')} <span className="text-red-500">*</span>
                            </Label>
                            <SearchableSelect
                                items={states.map(s => ({ value: s.value, label: s.label }))}
                                value={locationState}
                                onValueChange={(value) => {
                                    setLocationState(value);
                                    setLocationCity(''); // Reset city when state changes
                                }}
                                placeholder={t('dashboard.select_state_ph', 'Select a state...')}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="locationCity" className="font-semibold">
                                {t('dashboard.city_label', 'City')} <span className="text-red-500">*</span>
                            </Label>
                            <SearchableSelect
                                items={cities.map(c => ({ value: c.value, label: c.label }))}
                                value={locationCity}
                                onValueChange={setLocationCity}
                                placeholder={t('dashboard.select_city_ph', 'Select a city...')}
                                disabled={!locationState}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !isFormValid} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('common.save_changes', 'Save Changes')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}


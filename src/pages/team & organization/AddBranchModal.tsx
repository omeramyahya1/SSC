import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranchStore } from '@/store/useBranchStore';
import { useLocationData } from '@/hooks/useLocationData';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
        organization_uuid: organizationUuid
    });

    const [locationState, setLocationState] = useState('');
    const [locationCity, setLocationCity] = useState('');

    const { states, getCitiesByState } = useLocationData();
    const cities = useMemo(() => getCitiesByState(locationState), [locationState, getCitiesByState]);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !locationState || !locationCity) return;

        setIsSubmitting(true);
        try {
            const result = await createBranch({
                ...formData,
                location: `${locationCity}, ${locationState}`
            });
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

    const isFormValid = formData.name.trim() !== '' && locationState !== '' && locationCity !== '';

    return (
        <DialogContent className="sm:max-w-[425px] bg-white" dir={i18n.dir()}>
            <form onSubmit={handleSubmit}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{t('team.add_branch_title', 'Add New Branch')}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-8 space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="branch_name" className="font-semibold">{t('team.branch_name', 'Branch Name')} *</Label>
                        <Input
                            id="branch_name"
                            value={formData.name}
                            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder={t('team.branch_name', 'Branch Name')}
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

                <DialogFooter className='gap-4' dir={i18n.dir()}>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !isFormValid} className="text-white">
                        {isSubmitting ? t('common.saving', 'Saving...') : t('team.add_branch', 'Add Branch')}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}


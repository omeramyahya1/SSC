import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocationData } from '@/hooks/useLocationData';
import { SearchableSelect } from '@/components/ui/searchable-select';

export interface NewProjectData {
    customer_name: string;
    phone_number: string | undefined;
    email: string | undefined;
    project_location: string;
}

interface CreateProjectModalProps {
    onOpenChange: (isOpen: boolean) => void;
    onSubmit: (projectData: NewProjectData) => void;
}

export function CreateProjectModal({ onOpenChange, onSubmit }: CreateProjectModalProps) {
    const { t } = useTranslation();
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    
    const [locationState, setLocationState] = useState('');
    const [locationCity, setLocationCity] = useState('');

    const { states, getCitiesByState } = useLocationData();
    const cities = useMemo(() => getCitiesByState(locationState), [locationState, getCitiesByState]);

    const handleCreate = () => {
        onSubmit({
            customer_name: customerName,
            email: customerEmail || undefined,
            phone_number: customerPhone || undefined,
            project_location: `${locationCity}, ${locationState}`,
        });
    };

    const isFormValid = customerName.trim() !== '' && locationState.trim() !== '' && locationCity.trim() !== '';

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
                    <Label htmlFor="customerName" className="font-semibold">
                        {t('dashboard.customer_name_label', 'Customer Name')} <span className="text-red-500">*</span>
                    </Label>
                    <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('dashboard.customer_name_ph', 'e.g. John Doe')} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="customerEmail" className="font-semibold">
                            {t('dashboard.customer_email_label', 'Customer Email')}
                        </Label>
                        <Input id="customerEmail" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder={t('dashboard.customer_email_ph', 'e.g. johndoe@example.com')} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="customerPhone" className="font-semibold">
                            {t('dashboard.customer_phone_label', 'Customer Phone')}
                        </Label>
                        <Input id="customerPhone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={t('dashboard.customer_phone_ph', 'e.g. +249...')} />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="locationState" className="font-semibold">
                            {t('dashboard.state_label', 'State')} <span className="text-red-500">*</span>
                        </Label>
                        <SearchableSelect 
                            items={states}
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
                            items={cities}
                            value={locationCity}
                            onValueChange={setLocationCity}
                            placeholder={t('dashboard.select_city_ph', 'Select a city...')}
                            disabled={!locationState}
                        />
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button onClick={() => onOpenChange(false)} variant="outline">{t('dashboard.cancel', 'Cancel')}</Button>
                <Button onClick={handleCreate} disabled={!isFormValid} className="text-white">{t('dashboard.create_button', 'Create Project')}</Button>
            </DialogFooter>
        </DialogContent>
    );
}

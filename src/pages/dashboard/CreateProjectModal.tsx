import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocationData } from '@/hooks/useLocationData';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ProjectAppliance } from '@/store/useApplianceStore';
import { BleConfigData, BleSettingsPayload } from '@/store/useBleStore';
import { useCustomerStore } from '@/store/useCustomerStore';

export interface NewProjectData {
    customer_uuid?: string;
    customer_name: string;
    phone_number: string | undefined;
    email: string | undefined;
    project_location: string;
}

export interface QuickCalcConvertedData {
    appliances: ProjectAppliance[];
    config: BleConfigData;
    bleSettings: BleSettingsPayload;
}

interface CreateProjectModalProps {
    onOpenChange: (isOpen: boolean) => void;
    onSubmit: (projectData: NewProjectData, quickCalcData?: QuickCalcConvertedData) => void;
    initialData?: QuickCalcConvertedData | null;
}

export function CreateProjectModal({ onOpenChange, onSubmit, initialData }: CreateProjectModalProps) {
    const { t, i18n } = useTranslation();
    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [useExistingCustomer, setUseExistingCustomer] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');

    const { customers, fetchCustomers, isLoading: isCustomersLoading } = useCustomerStore();

    const [locationState, setLocationState] = useState('');
    const [locationCity, setLocationCity] = useState('');

    const { states, getCitiesByState } = useLocationData();
    const cities = useMemo(() => getCitiesByState(locationState), [locationState, getCitiesByState]);

    useEffect(() => {
        // Fallback to the metadata location
        if (initialData?.config?.metadata?.location) {
            const [city, state] = initialData.config.metadata.location.split(', ').map(s => s.trim());
            setLocationState(state);
            setLocationCity(city);
        }
    }, [initialData]);

    useEffect(() => {
        if (useExistingCustomer && customers.length === 0 && !isCustomersLoading) {
            fetchCustomers();
        }
    }, [useExistingCustomer, customers.length, isCustomersLoading, fetchCustomers]);

    const handleSelectExistingCustomer = (id: string) => {
        setSelectedCustomerId(id);
        const selected = customers.find(c => String(c.customer_id) === id || c.uuid === id);
        if (!selected) return;
        setCustomerName(selected.full_name || '');
        setCustomerEmail(selected.email || '');
        setCustomerPhone(selected.phone_number || '');
    };

    const handleCreate = () => {
        const projectData: NewProjectData = {
            customer_uuid: useExistingCustomer ? selectedCustomerId || undefined : undefined,
            customer_name: customerName,
            email: customerEmail || undefined,
            phone_number: customerPhone || undefined,
            project_location: `${locationCity}, ${locationState}`,
        };

        onSubmit(projectData, initialData || undefined);
    };

    const isFormValid =
        locationState.trim() !== '' &&
        locationCity.trim() !== '' &&
        (useExistingCustomer ? selectedCustomerId !== '' : customerName.trim() !== '');

    return (
        <DialogContent className="sm:max-w-[525px] bg-white" dir={i18n.dir()}>
            <DialogHeader>
                <DialogTitle className="text-2xl font-bold">{t('dashboard.create_project_title', 'Create a New Project')}</DialogTitle>
                <DialogDescription>
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <Label htmlFor="use-existing-customer" className="font-semibold">
                        {t('dashboard.use_existing_customer', 'Choose from existing customer?')}
                    </Label>
                    <Switch
                        id="use-existing-customer"
                        checked={useExistingCustomer}
                        onCheckedChange={(checked) => {
                            setUseExistingCustomer(checked);
                            if (!checked) {
                                setSelectedCustomerId('');
                            }
                        }}
                    />
                </div>

                {useExistingCustomer && (
                    <div className="grid gap-2">
                        <Label htmlFor="existingCustomer" className="font-semibold">
                            {t('dashboard.existing_customer_label', 'Existing Customer')}
                        </Label>
                        <SearchableSelect
                            items={customers.map(c => ({
                                value: c.uuid || String(c.customer_id),
                                label: c.full_name
                            }))}
                            value={selectedCustomerId}
                            onValueChange={handleSelectExistingCustomer}
                            placeholder={t('dashboard.existing_customer_ph', 'Select a customer...')}
                            disabled={isCustomersLoading}
                        />
                    </div>
                )}

                <div className="grid gap-2">
                    <Label htmlFor="customerName" className="font-semibold">
                        {t('dashboard.customer_name_label', 'Customer Name')} <span className="text-red-500">*</span>
                    </Label>
                    <Input id="customerName" disabled={useExistingCustomer} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('dashboard.customer_name_ph', 'e.g. John Doe')} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="customerEmail" className="font-semibold">
                            {t('dashboard.customer_email_label', 'Customer Email')}
                        </Label>
                        <Input id="customerEmail" disabled={useExistingCustomer} type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder={t('dashboard.customer_email_ph', 'e.g. johndoe@example.com')} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="customerPhone" className="font-semibold">
                            {t('dashboard.customer_phone_label', 'Customer Phone')}
                        </Label>
                        <Input id="customerPhone" disabled={useExistingCustomer} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={t('dashboard.customer_phone_ph', 'e.g. +249...')} />
                    </div>
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
            <DialogFooter className='flex gap-4 sm:justify-end'>
                <Button onClick={() => onOpenChange(false)} variant="outline">{t('dashboard.cancel', 'Cancel')}</Button>
                <Button onClick={handleCreate} disabled={!isFormValid} className="text-white">{t('dashboard.create_button', 'Create Project')}</Button>
            </DialogFooter>
        </DialogContent>
    );
}

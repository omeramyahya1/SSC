import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableHeader,
    TableRow,
    TableHead,
    TableBody,
    TableCell,
} from "@/components/ui/table";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLocationData } from '@/hooks/useLocationData';
import { ProjectAppliance } from '@/store/useApplianceStore'; // Keep ProjectAppliance interface
import { useBleStore, BleCalculationResults, BleSettingsPayload } from '@/store/useBleStore';
import { cn } from "@/lib/utils";
import { PlusIcon, MinusIcon, Calculator, AlertCircle } from 'lucide-react';
import { QuickCalcConvertedData } from './CreateProjectModal'; // Import for type
import useLocalStorage from '@/hooks/useLocalStorage';
import { toast } from 'react-hot-toast';

// --- Helper Components ---
// SettingsInput and DataRow are reused directly

const SettingsInput = ({ label, value, onChange, step = 1, min = -Infinity, max = Infinity, error, disabled }: {
    label: string,
    value: number | boolean,
    onChange: (value: number | boolean) => void,
    step?: number,
    min?: number,
    max?: number,
    error?: string | null,
    disabled?: boolean
}) => {
    const inputType = typeof value === 'boolean' ? 'checkbox' : 'number';
    const { i18n } = useTranslation();

    return (
        <div className="flex flex-col">
            <Label className="text-xs font-medium text-gray-600 mb-1">{label}</Label>
            {inputType === 'number' ? (
                <>
                    <Input
                        type="number"
                        value={value as number}
                        onChange={e => onChange(parseFloat(e.target.value) || 0)}
                        className={cn("h-9", error && "border-red-500")}
                        step={step}
                        min={min}
                        max={max}
                        disabled={disabled}
                    />
                    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                </>
            ) : (
                <Switch
                    checked={value as boolean}
                    onCheckedChange={onChange}
                    className="mt-2"
                    dir={i18n.dir()}
                    disabled={disabled}
                />
            )}
        </div>
    );
};

const DataRow = ({ label, value, unit = '', formatter }: { label: string; value: any; unit?: string; formatter?: (val: any) => string }) => {
    const { i18n } = useTranslation();

    if (value === null || value === undefined || value === "N/A") {
        return null;
    }
    const displayValue = formatter ? formatter(value) : String(value);
    return (
        <div className="py-1 border-b border-gray-100">
            { i18n.dir() === 'ltr' ? (
                <div className="flex justify-between">
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className="text-sm font-semibold text-gray-800">{displayValue} {unit}</span>
                </div>
            ) : (
                <div className="flex justify-between">
                    <span className="text-sm font-semibold text-gray-800">{displayValue} {unit}</span>
                    <span className="text-sm text-gray-500">{label}</span>
                </div>

            ) }

        </div>
    );
};


interface QuickCalculateModalProps {
    onConvert: (data: QuickCalcConvertedData) => void;
    onOpenChange: (isOpen: boolean) => void;
}

export function QuickCalculateModal({ onConvert }: QuickCalculateModalProps) {
    const { t, i18n } = useTranslation();
    const { getCitiesByState, states } = useLocationData();

    // State for local storage persistence
    const [appliances, setAppliances] = useLocalStorage<ProjectAppliance[]>('quickCalcAppliances', []);
    const [bleSettings, setBleSettings] = useLocalStorage('quickCalcBleSettings', {
        inverter_efficiency: 0.95,
        safety_factor: 1.25,
        inverter_rated_power: 3000,
        inverter_mppt_min_v: 120,
        inverter_mppt_max_v: 450,
        autonomy_days: 1,
        battery_dod: 0.6,
        battery_efficiency: 0.95,
        battery_type: 'liquid',
        battery_rated_capacity_ah: 200,
        battery_rated_voltage: 12,
        battery_max_parallel: 8,
        panel_rated_power: 550,
        panel_mpp_voltage: 42.5,
        system_losses: 0.85,
        temp_coefficient_power: -0.004,
        noct: 45,
        stc_temp: 25,
        reference_irradiance: 800,
        calculate_temp_derating: true,
        project_location_state: '', // Add state to settings
        project_location_city: '' // Add city to settings
    });

    // BLE Store - virtual calculation without project ID
    const {
        results: bleResults,
        isLoading: isBleLoading,
        error: bleError,
        runCalculation,
    } = useBleStore();

    // State for custom appliance input
    const [customApplianceName, setCustomApplianceName] = useState('');
    const [customApplianceWattage, setCustomApplianceWattage] = useState<number>(0);

    // Validation state for BLE settings
    const [bleSettingsErrors, setBleSettingsErrors] = useState<{[key: string]: string | null}>({});

    const validateBleSetting = (key: string, value: any): string | null => {
        let error: string | null = null;
        if (typeof value !== 'boolean' && (value === null || value === undefined || (typeof value === 'number' && isNaN(value)))) {
            error = t('common.required', 'Required');
            return error;
        }

        switch(key) {
            case 'inverter_efficiency':
            case 'battery_efficiency':
            case 'system_losses':
                if (value < 0 || value > 1) error = t('common.must_be_between_0_1', 'Must be between 0 and 1');
                break;
            case 'safety_factor':
                if (value < 1) error = t('common.must_be_1_or_greater', 'Must be 1 or greater');
                break;
            case 'autonomy_days':
            case 'battery_rated_capacity_ah':
            case 'battery_rated_voltage':
            case 'battery_max_parallel':
            case 'panel_rated_power':
            case 'inverter_rated_power':
            case 'inverter_mppt_min_v':
            case 'inverter_mppt_max_v':
            case 'panel_mpp_voltage':
            case 'noct':
            case 'stc_temp':
            case 'reference_irradiance':
                if (value <= 0) error = t('common.must_be_positive_number', 'Must be a positive number');
                break;
            case 'battery_dod':
                if (value < 0 || value > 1) error = t('common.must_be_between_0_1', 'Must be between 0 and 1');
                break;
            case 'temp_coefficient_power':
                if (value > 0 || value < -1) error = t('common.temp_coefficient_power_hint', 'Typically a small negative number (e.g., -0.004)');
                break;
            case 'project_location_state':
            case 'project_location_city':
                if (!value) error = t('common.required', 'Required');
                break;
        }
        return error;
    };

    const handleBleSettingChange = (key: string, value: any) => {
        let processedValue = value;
        if (typeof value === 'string' && !isNaN(parseFloat(value))) {
            processedValue = parseFloat(value);
        }
        setBleSettings(prev => ({ ...prev, [key]: processedValue }));
        const error = validateBleSetting(key, processedValue);
        setBleSettingsErrors(prev => ({ ...prev, [key]: error }));
    };

    const hasBleSettingsErrors = useMemo(() => {
        return Object.values(bleSettingsErrors).some(error => error !== null);
    }, [bleSettingsErrors]);

    useEffect(() => {
        const newErrors: {[key: string]: string | null} = {};
        for (const key in bleSettings) {
            newErrors[key] = validateBleSetting(key, (bleSettings as any)[key]);
        }
        setBleSettingsErrors(newErrors);
    }, [bleSettings]);

    const handleAddCustomAppliance = () => {
        if (customApplianceName && customApplianceWattage > 0) {
            setAppliances(prev => [
                ...prev,
                {
                    appliance_id: Date.now(), // Unique ID for quick calc
                    appliance_name: customApplianceName,
                    wattage: customApplianceWattage,
                    type: 'heavy',
                    qty: 1,
                    use_hours_night: 1
                }
            ]);
            setCustomApplianceName('');
            setCustomApplianceWattage(0);
        }
    };

    const handleUpdateAppliance = (appliance_id: number, updates: Partial<ProjectAppliance>) => {
        setAppliances(prev =>
            prev.map(app => (app.appliance_id === appliance_id ? { ...app, ...updates } : app))
        );
    };

    const handleRemoveAppliance = (appliance_id: number) => {
        setAppliances(prev => prev.filter(app => app.appliance_id !== appliance_id));
    };

    const totalEnergy = useMemo(() => appliances.reduce((sum, app) => sum + (app.wattage * app.qty * app.use_hours_night), 0), [appliances]);
    const totalPower = useMemo(() => appliances.reduce((sum, app) => sum + (app.wattage * app.qty), 0), [appliances]);

    const formatPowerValue = (value: number) => {
        if (value >= 1000) {
            return `${(value / 1000).toFixed(2)} kW`;
        }
        return `${value.toFixed(0)} W`;
    };

    const formatEnergyValue = (value: number) => {
        if (value >= 1000) {
            return `${(value / 1000).toFixed(2)} kWh`;
        }
        return `${value.toFixed(0)} Wh`;
    };

    const handleRunCalculation = useCallback(async () => {
        const newErrors: {[key: string]: string | null} = {};
        for (const key in bleSettings) {
            newErrors[key] = validateBleSetting(key, (bleSettings as any)[key]);
        }
        setBleSettingsErrors(newErrors);

        const projectLocation = `${bleSettings.project_location_city}, ${bleSettings.project_location_state}`;
        const hasLocation = bleSettings.project_location_city && bleSettings.project_location_state;

        if (!hasLocation || hasBleSettingsErrors || appliances.length === 0) {
            toast.error(t('project_modal.calculation_error_hint', 'Please ensure location is selected and at least one appliance is added.'));
            return;
        }

        // We use a dummy project ID since we're not saving to a real project yet
        await runCalculation(0, bleSettings, appliances, projectLocation);
    }, [runCalculation, bleSettings, appliances, hasBleSettingsErrors]);

    const handleConvertClick = () => {
        if (!bleResults?.data) {
            toast.error(t('project_modal.no_results_to_convert', 'No calculation results to convert. Please run calculation first.'));
            return;
        }
        if (!bleSettings.project_location_state || !bleSettings.project_location_city) {
            toast.error(t('project_modal.location_required_for_conversion', 'Location is required to convert to project.'));
            return;
        }
        const convertedData: QuickCalcConvertedData = {
            appliances: appliances,
            config: bleResults.data,
            bleSettings: bleSettings,
        };
        onConvert(convertedData);
    };

    const handleCopyResults = async () => {
        if (!bleResults?.data) {
            toast.error(t('project_modal.no_results_to_copy', 'No calculation results to copy. Please run calculation first.'));
            return;
        }

        let resultsString = `--- ${t('project_modal.quick_calc_results_summary', 'Quick Calculation Results Summary')} ---\n`;
        resultsString += `${t('project_modal.location', 'Location')}: ${bleSettings.project_location_city}, ${bleSettings.project_location_state}\n\n`;

        // Add appliance breakdown
        resultsString += `${t('project_modal.appliances_breakdown', 'Appliances Breakdown')}:\n`;
        appliances.forEach(app => {
            resultsString += `- ${app.appliance_name} (${app.wattage}W x ${app.qty} x ${app.use_hours_night}h) = ${app.wattage * app.qty * app.use_hours_night} Wh/day\n`;
        });
        resultsString += `${t('project_modal.total_power', 'Total Power')}: ${formatPowerValue(totalPower)}\n`;
        resultsString += `${t('project_modal.total_energy', 'Total Energy')}: ${formatEnergyValue(totalEnergy)}/day\n\n`;

        // Add BLE calculation results
        resultsString += `--- ${t('project_modal.system_configuration', 'System Configuration')} ---\n`;
        const data = bleResults.data;
        if (data) {
            resultsString += `${t('ble.metadata.total_system_size', 'Total System Size')}: ${formatPowerValue(data.metadata.total_system_size_kw * 1000)}\n`;
            // Solar Panels: Quantity & Power
            resultsString += `${t('ble.solar_panels.quantity', 'Solar Panels Quantity')}: ${data.solar_panels.quantity}, ${t('ble.solar_panels.power_rating', 'Power Rating')}: ${formatPowerValue(data.solar_panels.power_rating_w)}\n`;
            // Batteries: Quantity & AH & Energy Storage & type (Lithium, etc)
            resultsString += `${t('ble.battery_bank.quantity', 'Battery Bank Quantity')}: ${data.battery_bank.quantity}, ${t('ble.battery_bank.capacity_per_unit', 'Capacity per Unit')}: ${data.battery_bank.capacity_per_unit_ah} Ah, ${t('ble.battery_bank.total_storage', 'Total Storage')}: ${parseFloat(String(data.battery_bank.total_storage_kwh)).toFixed(2)} kWh, ${t('ble.battery_bank.battery_type', 'Battery Type')}: ${data.battery_bank.battery_type}\n`;
            // Inverter: Quantity & Rated Power
            resultsString += `${t('ble.inverter.quantity', 'Inverter Quantity')}: ${data.inverter.quantity}, ${t('ble.inverter.power_rating', 'Rated Power')}: ${formatPowerValue(data.inverter.power_rating_w)}\n`;
        }

        try {
            await navigator.clipboard.writeText(resultsString);
            toast.success(t('project_modal.copy_success', 'Results copied to clipboard!'));
        } catch (err) {
            console.error('Failed to copy results: ', err);
            toast.error(t('project_modal.copy_error', 'Failed to copy results.'));
        }
    };

    // Validation state for appliance inputs - same as ProjectDetailsModal
    const [applianceInputErrors] = useState<{[key: number]: {[field: string]: string | null}}>({});

    const hasApplianceInputErrors = useMemo(() => {
        return Object.values(applianceInputErrors).some(fieldErrors =>
            Object.values(fieldErrors).some(error => error !== null)
        );
    }, [applianceInputErrors]);

    // Determine which results to display
    const displayResults = bleResults?.data;

    const citiesForState = useMemo(() => getCitiesByState(bleSettings.project_location_state), [bleSettings.project_location_state, getCitiesByState]);

    return (
        <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 bg-white" dir={i18n.dir()}>
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-2xl flex items-center justify-center gap-2">
                    <img src="/eva-icons (2)/outline/flash.png" alt="quick calc" className="w-6 h-6" />
                    {t('dashboard.quick_calc', 'Quick Calculate')}
                </DialogTitle>
            </DialogHeader>

            <div className="flex-grow grid grid-cols-2 overflow-hidden">
                {/* Left Column: Configuration */}
                <div className="flex flex-col p-6 overflow-y-auto border-e gap-6">
                    {/* Location Selection */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">{t('project_modal.location', 'Location')}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label className="text-xs text-gray-500">{t('dashboard.state_label', 'State')}</Label>
                                <SearchableSelect
                                    items={states.map(s => ({ value: s.value, label: s.label }))}
                                    value={bleSettings.project_location_state}
                                    onValueChange={(value) => {
                                        setBleSettings(prev => ({...prev, project_location_state: value, project_location_city: ''}));
                                        setBleSettingsErrors(prev => ({...prev, project_location_state: validateBleSetting('project_location_state', value), project_location_city: null}));
                                    }}
                                    placeholder={t('dashboard.select_state_ph', 'Select a state...')}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-xs text-gray-500">{t('dashboard.city_label', 'City')}</Label>
                                <SearchableSelect
                                    items={citiesForState.map(c => ({ value: c.value, label: c.label }))}
                                    value={bleSettings.project_location_city}
                                    onValueChange={(value) => handleBleSettingChange('project_location_city', value)}
                                    placeholder={t('dashboard.select_city_ph', 'Select a city...')}
                                    disabled={!bleSettings.project_location_state}
                                />
                            </div>
                        </div>
                    </div>

                     {/* System Design Parameters */}
                    <div>
                        <Accordion type="single" collapsible defaultValue="ble-settings">
                            <AccordionItem value="ble-settings">
                                <AccordionTrigger className="text-xl font-bold flex flex-row justify-between w-full">
                                    {t('project_modal.design_parameters', 'System Design Parameters')}
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 pt-4">
                                        {/* --- Inverter --- */}
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-md border">
                                            <h4 className='font-semibold text-gray-700'>{t('project_modal.inverter', 'Inverter')}</h4>
                                            <SettingsInput
                                                label={t('ble.inverter.efficiency_label', 'Efficiency (%)')}
                                                value={bleSettings.inverter_efficiency * 100}
                                                onChange={v => handleBleSettingChange('inverter_efficiency', Number(v) / 100)}
                                                step={1} min={0} max={100}
                                                error={bleSettingsErrors.inverter_efficiency}
                                            />
                                            <SettingsInput
                                                label={t('ble.inverter.safety_factor_label', 'Safety Factor (%)')}
                                                value={bleSettings.safety_factor * 100}
                                                onChange={v => handleBleSettingChange('safety_factor', Number(v) / 100)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.safety_factor}
                                            />
                                            <SettingsInput
                                                label={t('ble.inverter.rated_power_label', 'Rated Power (W)')}
                                                value={bleSettings.inverter_rated_power}
                                                onChange={v => handleBleSettingChange('inverter_rated_power', v)}
                                                step={100} min={1}
                                                error={bleSettingsErrors.inverter_rated_power}
                                            />
                                            <SettingsInput
                                                label={t('ble.inverter.mppt_min_v_label', 'MPPT Min Voltage (V)')}
                                                value={bleSettings.inverter_mppt_min_v}
                                                onChange={v => handleBleSettingChange('inverter_mppt_min_v', v)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.inverter_mppt_min_v}
                                            />
                                            <SettingsInput
                                                label={t('ble.inverter.mppt_max_v_label', 'MPPT Max Voltage (V)')}
                                                value={bleSettings.inverter_mppt_max_v}
                                                onChange={v => handleBleSettingChange('inverter_mppt_max_v', v)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.inverter_mppt_max_v}
                                            />
                                        </div>

                                        {/* --- Battery --- */}
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-md border">
                                            <h4 className='font-semibold text-gray-700'>{t('project_modal.battery_bank', 'Battery Bank')}</h4>
                                            <div>
                                                <Label className="text-xs font-medium text-gray-600">{t('project_modal.battery_type_label', 'Battery Type')}</Label>
                                                <Select
                                                    dir={i18n.dir()}
                                                    value={bleSettings.battery_type}
                                                    onValueChange={(v: 'liquid' | 'lithium' | 'dry' | 'other') => {
                                                        const newDod = v === 'lithium' ? 0.9 : 0.6;
                                                        setBleSettings(s => ({...s, battery_type: v, battery_dod: newDod}));
                                                        setBleSettingsErrors(prev => ({...prev, battery_type: null, battery_dod: null}));
                                                    }}
                                                >
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="liquid">{t('project_modal.battery_type.liquid', 'Lead-Acid (Liquid)')}</SelectItem>
                                                        <SelectItem value="dry">{t('project_modal.battery_type.dry', 'Lead-Acid (AGM/Gel)')}</SelectItem>
                                                        <SelectItem value="lithium">{t('project_modal.battery_type.lithium', 'Lithium-ion')}</SelectItem>
                                                        <SelectItem value="other">{t('project_modal.battery_type.other', 'Other')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <SettingsInput
                                                label={t('ble.battery_bank.dod_label', 'Depth of Discharge (DoD %)')}
                                                value={bleSettings.battery_dod * 100}
                                                onChange={v => handleBleSettingChange('battery_dod', Number(v) / 100)}
                                                step={1} min={0} max={100}
                                                error={bleSettingsErrors.battery_dod}
                                            />
                                            <SettingsInput
                                                label={t('ble.battery_bank.efficiency_label', 'Efficiency (%)')}
                                                value={bleSettings.battery_efficiency * 100}
                                                onChange={v => handleBleSettingChange('battery_efficiency', Number(v) / 100)}
                                                step={1} min={0} max={100}
                                                error={bleSettingsErrors.battery_efficiency}
                                            />
                                            <SettingsInput
                                                label={t('ble.battery_bank.capacity_per_unit_label', 'Capacity per Unit (Ah)')}
                                                value={bleSettings.battery_rated_capacity_ah}
                                                onChange={v => handleBleSettingChange('battery_rated_capacity_ah', v)}
                                                step={10} min={1}
                                                error={bleSettingsErrors.battery_rated_capacity_ah}
                                            />
                                            <SettingsInput
                                                label={t('ble.battery_bank.voltage_per_unit_label', 'Voltage per Unit (V)')}
                                                value={bleSettings.battery_rated_voltage}
                                                onChange={v => handleBleSettingChange('battery_rated_voltage', v)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.battery_rated_voltage}
                                            />
                                             <SettingsInput
                                                label={t('ble.battery_bank.max_parallel_units_label', 'Max Parallel Units')}
                                                value={bleSettings.battery_max_parallel}
                                                onChange={v => handleBleSettingChange('battery_max_parallel', v)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.battery_max_parallel}
                                            />
                                             <SettingsInput
                                                label={t('ble.battery_bank.autonomy_days_label', 'Days of Autonomy')}
                                                value={bleSettings.autonomy_days}
                                                onChange={v => handleBleSettingChange('autonomy_days', v)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.autonomy_days}
                                            />
                                        </div>

                                        {/* --- Panels --- */}
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-md border">
                                             <h4 className='font-semibold text-gray-700'>{t('project_modal.solar_array', 'Solar Array')}</h4>
                                             <SettingsInput
                                                label={t('ble.solar_panels.panel_power_label', 'Panel Power (W)')}
                                                value={bleSettings.panel_rated_power}
                                                onChange={v => handleBleSettingChange('panel_rated_power', v)}
                                                step={10} min={1}
                                                error={bleSettingsErrors.panel_rated_power}
                                            />
                                            <SettingsInput
                                                label={t('ble.solar_panels.panel_mpp_voltage_label', 'Panel MPP Voltage (V)')}
                                                value={bleSettings.panel_mpp_voltage}
                                                onChange={v => handleBleSettingChange('panel_mpp_voltage', v)}
                                                step={0.1} min={1}
                                                error={bleSettingsErrors.panel_mpp_voltage}
                                            />
                                            <SettingsInput
                                                label={t('ble.solar_panels.system_losses_label', 'System Losses (%)')}
                                                value={bleSettings.system_losses * 100}
                                                onChange={v => handleBleSettingChange('system_losses', Number(v) / 100)}
                                                step={1} min={0} max={100}
                                                error={bleSettingsErrors.system_losses}
                                            />
                                            <SettingsInput
                                                label={t('ble.solar_panels.temp_coefficient_power_label', 'Temp Coefficient Power')}
                                                value={bleSettings.temp_coefficient_power}
                                                onChange={v => handleBleSettingChange('temp_coefficient_power', v)}
                                                step={0.001} min={-1} max={0}
                                                error={bleSettingsErrors.temp_coefficient_power}
                                            />
                                            <SettingsInput
                                                label={t('ble.solar_panels.noct_label', 'NOCT (°C)')}
                                                value={bleSettings.noct}
                                                onChange={v => handleBleSettingChange('noct', v)}
                                                step={1} min={0}
                                                error={bleSettingsErrors.noct}
                                            />
                                            <SettingsInput
                                                label={t('ble.solar_panels.stc_temp_label', 'STC Temp (°C)')}
                                                value={bleSettings.stc_temp}
                                                onChange={v => handleBleSettingChange('stc_temp', v)}
                                                step={1} min={0}
                                                error={bleSettingsErrors.stc_temp}
                                            />
                                            <SettingsInput
                                                label={t('ble.solar_panels.reference_irradiance_label', 'Reference Irradiance (W/m²)')}
                                                value={bleSettings.reference_irradiance}
                                                onChange={v => handleBleSettingChange('reference_irradiance', v)}
                                                step={1} min={1}
                                                error={bleSettingsErrors.reference_irradiance}
                                            />
                                            <div className={cn("flex items-center", i18n.dir() === 'rtl' ? 'space-x-reverse space-x-2' : 'space-x-2')}>
                                                <Switch
                                                    id="calculate-temp-derating"
                                                    checked={bleSettings.calculate_temp_derating}
                                                    onCheckedChange={checked => handleBleSettingChange('calculate_temp_derating', checked)}
                                                    dir={i18n.dir()}
                                                />
                                                <Label htmlFor="calculate-temp-derating" className="text-xs font-medium text-gray-600">{t('project_modal.calculate_temp_derating_label', 'Calculate Temp Derating')}</Label>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>

                    <div>
                        <h3 className="text-xl font-bold mb-4">{t('project_modal.appliances_breakdown', 'Appliances Breakdown')}</h3>

                        {/* Custom Appliance Input Form */}
                        <div className="grid grid-cols-12 gap-2 p-3 mb-4 border rounded-lg bg-gray-50">
                            <div className="col-span-7">
                                <Label htmlFor='appliance-name' className='text-xs text-gray-500 font-semibold'>{t('project_modal.appliance_name_label', 'Appliance Name')}</Label>
                                <Input
                                    id='appliance-name'
                                    placeholder={t('project_modal.add_appliance_name_ph', 'e.g., Refrigerator')}
                                    value={customApplianceName}
                                    onChange={(e) => setCustomApplianceName(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                            <div className="col-span-3">
                                <Label htmlFor='appliance-wattage' className='text-xs text-gray-500 font-semibold'>{t('project_modal.wattage_label', 'Wattage (W)')}</Label>
                                <Input
                                    id='appliance-wattage'
                                    type="number"
                                    placeholder={t('project_modal.add_appliance_wattage_ph', 'e.g., 150')}
                                    value={customApplianceWattage}
                                    onChange={(e) => setCustomApplianceWattage(Number(e.target.value))}
                                    className="bg-white"
                                />
                            </div>
                            <div className="col-span-2 flex items-end">
                                <Button
                                    onClick={handleAddCustomAppliance}
                                    disabled={!customApplianceName || !customApplianceWattage || customApplianceWattage <= 0}
                                    className="w-full font-bold text-white"
                                >
                                    <PlusIcon className={cn("h-4 w-4", i18n.dir() === 'rtl' ? 'ml-2' : 'mr-2')} /> {t('project_modal.add', 'Add')}
                                </Button>
                            </div>
                        </div>

                        {isBleLoading && appliances.length === 0 && <Spinner className="w-8 h-8 mx-auto" />}

                        <ScrollArea className="flex-grow h-[300px] mb-4 rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[150px] font-bold">{t('project_modal.appliance', 'Appliance')}</TableHead>
                                        <TableHead className="w-[100px] text-center font-bold">{t('project_modal.wattage', 'Wattage (W)')}</TableHead>
                                        <TableHead className="w-[80px] text-center font-bold">{t('project_modal.qty', 'Qty')}</TableHead>
                                        <TableHead className="w-[100px] text-center font-bold">{t('project_modal.use_hours_night', 'Night/Battery Hrs')}</TableHead>
                                        <TableHead className="w-[100px] text-center font-bold">{t('project_modal.power', 'Power (W)')}</TableHead>
                                        <TableHead className="w-[120px] text-center font-bold">{t('project_modal.energy', 'Energy (Wh/day)')}</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {appliances.map((app) => (
                                        <TableRow key={app.appliance_id}>
                                            <TableCell className="font-medium">{app.appliance_name}</TableCell>
                                            <TableCell>
                                                <div className='flex flex-col'>
                                                    <Input
                                                        type="number"
                                                        value={app.wattage}
                                                        onChange={(e) => handleUpdateAppliance(app.appliance_id, { wattage: parseFloat(e.target.value) || 0 })}
                                                        className={cn("w-full text-center p-1 h-8", applianceInputErrors[app.appliance_id]?.wattage && "border-red-500")}
                                                    />
                                                    {applianceInputErrors[app.appliance_id]?.wattage && <p className="text-red-500 text-xs mt-1">{applianceInputErrors[app.appliance_id]?.wattage}</p>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className='flex flex-col'>
                                                    <Input
                                                        type="number"
                                                        value={app.qty}
                                                        onChange={(e) => handleUpdateAppliance(app.appliance_id, { qty: parseInt(e.target.value) || 0 })}
                                                        className={cn("w-full text-center p-1 h-8", applianceInputErrors[app.appliance_id]?.qty && "border-red-500")}
                                                    />
                                                    {applianceInputErrors[app.appliance_id]?.qty && <p className="text-red-500 text-xs mt-1">{applianceInputErrors[app.appliance_id]?.qty}</p>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className='flex flex-col'>
                                                <Input
                                                    type="number"
                                                    value={app.use_hours_night}
                                                    onChange={(e) => handleUpdateAppliance(app.appliance_id, { use_hours_night: parseFloat(e.target.value) || 0 })}
                                                    className={cn("w-full text-center p-1 h-8", applianceInputErrors[app.appliance_id]?.use_hours_night && "border-red-500")}
                                                />
                                                {applianceInputErrors[app.appliance_id]?.use_hours_night && <p className="text-red-500 text-xs mt-1">{applianceInputErrors[app.appliance_id]?.use_hours_night}</p>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">{app.wattage * app.qty}</TableCell>
                                            <TableCell className="text-center">{app.wattage * app.qty * app.use_hours_night}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemoveAppliance(app.appliance_id)}>
                                                    <MinusIcon className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <div className="flex flex-row justify-between items-center px-4 py-2 border-t font-bold text-end">
                            <span className='text-transparent'>{t('project_modal.total_power', 'Power')}: {formatPowerValue(totalPower)}</span>
                            <span>{t('project_modal.total_power', 'Power')}: {formatPowerValue(totalPower)}</span>
                            <span>{t('project_modal.total_energy', 'Energy')}: {formatEnergyValue(totalEnergy)}/day</span>
                        </div>
                    </div>

                    <Button
                        onClick={handleRunCalculation}
                        disabled={isBleLoading || hasBleSettingsErrors || appliances.length === 0 || hasApplianceInputErrors}
                        className="w-full mt-auto text-white"
                    >
                        {isBleLoading ? <Spinner className="mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                        {t('project_modal.calculate', 'Calculate')}
                    </Button>
                </div>


                {/* Right Column: BLE Results */}
                <div className="flex flex-col p-6 overflow-y-auto">
                    <h3 className="text-xl font-bold mb-4">{t('project_modal.system_configuration', 'System Configuration')}</h3>

                    {isBleLoading && (
                        <div className="flex items-center justify-center h-full">
                            <Spinner className="w-12 h-12" />
                        </div>
                    )}

                    {bleError && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t('common.error', 'Error')}</AlertTitle>
                            <AlertDescription>{bleError}</AlertDescription>
                        </Alert>
                    )}

                    {!isBleLoading && !bleError && !displayResults && (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <Calculator className="w-16 h-16 mb-4 text-gray-300" />
                            <p className="font-semibold">{t('project_modal.no_results_title', 'No Results Yet')}</p>
                            <p className="text-sm">{t('project_modal.no_results_subtitle', 'Click "Calculate" to run the system analysis.')}</p>
                        </div>
                    )}

                    {!bleError && displayResults && (
                        <ScrollArea className="flex-grow">
                            <Accordion type="multiple" defaultValue={['metadata', 'solar_panels', 'inverter', 'battery_bank']} className="w-full">
                                <AccordionItem value="metadata">
                                    <AccordionTrigger className={cn('font-bold flex w-full justify-between', i18n.dir() === 'rtl' ? 'flex-row-reverse' : '')}>{t('project_modal.metadata_accordion_title', 'Metadata')}</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label={t('ble.metadata.peak_sun_hours', 'Peak Sun Hours')} value={displayResults.metadata.peak_sun_hours} />
                                            <DataRow label={t('ble.metadata.total_system_size', 'Total System Size')} value={parseFloat(String(displayResults.metadata.total_system_size_kw))} unit="kW" formatter={(val: number) => val.toFixed(2)} />
                                            <DataRow label={t('ble.metadata.peak_surge_power', 'Peak Surge Power')} value={displayResults.metadata.peak_surge_power_w} formatter={formatPowerValue} />
                                            <DataRow label={t('ble.metadata.autonomy_days', 'Autonomy Days')} value={displayResults.metadata.autonomy_days} />
                                            <DataRow label={t('ble.metadata.total_daily_energy', 'Total Daily Energy')} value={displayResults.metadata.total_daily_energy_wh} formatter={formatEnergyValue} />
                                            <DataRow label={t('ble.metadata.total_peak_power', 'Total Peak Power')} value={displayResults.metadata.total_peak_power_w} formatter={formatPowerValue} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="solar_panels">
                                    <AccordionTrigger className={cn('font-bold flex w-full justify-between', i18n.dir() === 'rtl' ? 'flex-row-reverse' : '')}>{t('project_modal.solar_panels', 'Solar Panels')}</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label={t('ble.solar_panels.power_rating', 'Power Rating')} value={displayResults.solar_panels.power_rating_w} formatter={formatPowerValue} />
                                            <DataRow label={t('ble.solar_panels.quantity', 'Quantity')} value={displayResults.solar_panels.quantity} />
                                            <DataRow label={t('ble.solar_panels.total_capacity', 'Total PV Capacity')} value={parseFloat(String(displayResults.metadata.total_system_size_kw))} unit="kW" formatter={(val: number) => val.toFixed(2)} />
                                            <DataRow label={t('ble.solar_panels.panels_per_string', 'Panels per String')} value={displayResults.solar_panels.panels_per_string} />
                                            <DataRow label={t('ble.solar_panels.num_strings', 'Num. Parallel Strings')} value={displayResults.solar_panels.num_parallel_strings} />
                                            <DataRow label={t('ble.solar_panels.connection', 'Connection Type')} value={displayResults.solar_panels.connection_type} />
                                            <DataRow label={t('ble.solar_panels.tilt_angle', 'Tilt Angle')} value={`${displayResults.solar_panels.tilt_angle}°`} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="inverter">
                                    <AccordionTrigger className={cn('font-bold flex w-full justify-between', i18n.dir() === 'rtl' ? 'flex-row-reverse' : '')}>{t('project_modal.inverter', 'Inverter')}</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label={t('ble.inverter.power_rating', 'Power Rating')} value={displayResults.inverter.power_rating_w} formatter={formatPowerValue} />
                                            <DataRow label={t('ble.inverter.quantity', 'Quantity')} value={displayResults.inverter.quantity} />
                                            <DataRow label={t('ble.inverter.recommended_rating', 'Recommended Rating')} value={displayResults.inverter.recommended_rating} formatter={formatPowerValue} />
                                            <DataRow label={t('ble.inverter.efficiency', 'Efficiency')} value={`${displayResults.inverter.efficiency_percent}%`} />
                                            <DataRow label={t('ble.inverter.surge_rating', 'Surge Rating')} value={displayResults.inverter.surge_rating_w} formatter={formatPowerValue} />
                                            <DataRow label={t('ble.inverter.output_voltage', 'Output Voltage')} value={`${displayResults.inverter.output_voltage_v} V`} />
                                            <DataRow label={t('ble.inverter.connection', 'Connection Type')} value={displayResults.inverter.connection_type} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="battery_bank">
                                    <AccordionTrigger className={cn('font-bold flex w-full justify-between', i18n.dir() === 'rtl' ? 'flex-row-reverse' : '')}>{t('project_modal.battery_bank', 'Battery Bank')}</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label={t('ble.battery_bank.battery_type', 'Battery Type')} value={displayResults.battery_bank.battery_type} />
                                            <DataRow label={t('ble.battery_bank.capacity_per_unit', 'Capacity per Unit')} value={`${displayResults.battery_bank.capacity_per_unit_ah} Ah`} />
                                            <DataRow label={t('ble.battery_bank.voltage_per_unit', 'Voltage per Unit')} value={`${displayResults.battery_bank.voltage_per_unit_v} V`} />
                                            <DataRow label={t('ble.battery_bank.quantity', 'Quantity')} value={displayResults.battery_bank.quantity} />
                                            <DataRow label={t('ble.battery_bank.num_in_series', 'Num in Series')} value={displayResults.battery_bank.num_in_series} />
                                            <DataRow label={t('ble.battery_bank.num_in_parallel', 'Num in Parallel')} value={displayResults.battery_bank.num_in_parallel} />
                                            <DataRow label={t('ble.battery_bank.total_storage', 'Total Storage')} value={parseFloat(String(displayResults.battery_bank.total_storage_kwh))} unit="kWh" formatter={(val: number) => val.toFixed(2)} />
                                            <DataRow label={t('ble.battery_bank.depth_of_discharge', 'Depth of Discharge')} value={`${displayResults.battery_bank.depth_of_discharge_percent}%`} />
                                            <DataRow label={t('ble.battery_bank.system_voltage', 'System Voltage')} value={`${displayResults.battery_bank.system_voltage_v} V`} />
                                            <DataRow label={t('ble.battery_bank.connection', 'Connection Type')} value={displayResults.battery_bank.connection_type} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                            <div className="flex gap-2 mt-4">
                                <Button
                                    onClick={handleConvertClick}
                                    disabled={!bleResults?.data || !bleSettings.project_location_state || !bleSettings.project_location_city}
                                    className="w-full text-white bg-green-600 hover:bg-green-700"
                                >
                                    <img src="/eva-icons (2)/outline/trending-up.png" alt="convert" className="w-5 h-5 invert ltr:mr-2 rtl:ml-2" />
                                    {t('project_modal.convert_to_project', 'Convert to Project')}
                                </Button>
                                <Button
                                    onClick={handleCopyResults}
                                    disabled={!bleResults?.data}
                                    variant="outline"
                                    className="w-full"
                                >
                                    <img src="/eva-icons (2)/outline/copy.png" alt="copy" className="w-5 h-5 ltr:mr-2 rtl:ml-2" />
                                    {t('project_modal.copy_results', 'Copy Results')}
                                </Button>
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </div>
        </DialogContent>
    );
}

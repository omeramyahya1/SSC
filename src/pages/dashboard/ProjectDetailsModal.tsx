import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
import { useLocationData } from '@/hooks/useLocationData';
import { useApplianceStore, ProjectAppliance } from '@/store/useApplianceStore';
import { useBleStore } from '@/store/useBleStore';
import { Project } from "@/store/useProjectStore";
import { BleResultsChart } from './BleResultsChart';
import { cn } from "@/lib/utils";
import { Pencil, X, Save, PlusIcon, MinusIcon, Calculator, AlertCircle } from 'lucide-react';
import { useProjectStore, ProjectUpdatePayload } from "@/store/useProjectStore";
import { SearchableSelect } from '@/components/ui/searchable-select';

// ... (rest of the imports)

// --- Helper Components ---

interface ProjectInfoProps {
    project: Project;
}

function ProjectInfo({ project }: ProjectInfoProps) {
    const { t } = useTranslation();
    const { updateProject } = useProjectStore();
    const { states, getCitiesByState } = useLocationData();

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<ProjectUpdatePayload>({});
    const [cities, setCities] = useState<string[]>([]);
    const [selectedState, setSelectedState] = useState('');

    useEffect(() => {
        if (project) {
            const [city, state] = project.project_location?.split(', ').map(p => p.trim()) || ['', ''];
            setEditData({
                full_name: project.customer.full_name,
                email: project.customer.email || '',
                phone_number: project.customer.phone_number || '',
                project_location: project.project_location || '',
            });
            if (state) {
                setSelectedState(state);
                setCities(getCitiesByState(state));
            }
        }
    }, [project, isEditing]);

    const handleStateChange = (state: string) => {
        setSelectedState(state);
        const citiesForState = getCitiesByState(state);
        setCities(citiesForState);
        // Also update the city part of the location
        const currentCity = editData.project_location?.split(', ')[0] || '';
        if (!citiesForState.includes(currentCity)) {
             handleFieldChange('project_location', `, ${state}`);
        } else {
             handleFieldChange('project_location', `${currentCity}, ${state}`);
        }
    };
    
    const handleCityChange = (city: string) => {
        handleFieldChange('project_location', `${city}, ${selectedState}`);
    };

    const handleFieldChange = (field: keyof ProjectUpdatePayload, value: string) => {
        setEditData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!project) return;
        try {
            await updateProject(project.uuid, editData);
            setIsEditing(false);
        } catch (error) {
            console.error("Failed to save project details", error);
            // Optionally: show toast notification
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        // Reset editData to original project data
        if (project) {
             const [city, state] = project.project_location?.split(', ').map(p => p.trim()) || ['', ''];
            setEditData({
                full_name: project.customer.full_name,
                email: project.customer.email || '',
                phone_number: project.customer.phone_number || '',
                project_location: project.project_location || '',
            });
            setSelectedState(state);
        }
    };

    return (
        <div className="relative border rounded-lg p-4">
            <div className="absolute top-2 right-2">
                {isEditing ? (
                    <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={handleSave} className="h-7 w-7 text-green-600 hover:text-green-700">
                            <Save className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleCancel} className="h-7 w-7 text-red-600 hover:text-red-700">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)} className="h-7 w-7">
                        <Pencil className="h-4 w-4" />
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* Customer Name */}
                <div>
                    <Label className="text-xs text-gray-500">{t('dashboard.customer_name_label', 'Customer Name')}</Label>
                    {isEditing ? (
                        <Input value={editData.full_name} onChange={e => handleFieldChange('full_name', e.target.value)} className="text-base"/>
                    ) : (
                        <p className="text-base font-semibold">{project.customer.full_name}</p>
                    )}
                </div>

                {/* State */}
                 <div>
                    <Label className="text-xs text-gray-500">{t('dashboard.state_label', 'State')}</Label>
                    {isEditing ? (
                        <SearchableSelect items={states} value={selectedState} onValueChange={handleStateChange} placeholder="Select state..."/>
                    ) : (
                         <p className="text-base font-semibold">{project.project_location?.split(', ')[1] || 'N/A'}</p>
                    )}
                </div>

                {/* Email */}
                <div>
                    <Label className="text-xs text-gray-500">{t('dashboard.customer_email_label', 'Customer Email')}</Label>
                    {isEditing ? (
                        <Input type="email" value={editData.email} onChange={e => handleFieldChange('email', e.target.value)} className="text-base" />
                    ) : (
                        <p className="text-base font-semibold">{project.customer.email || 'N/A'}</p>
                    )}
                </div>

                {/* City */}
                 <div>
                    <Label className="text-xs text-gray-500">{t('dashboard.city_label', 'City')}</Label>
                     {isEditing ? (
                        <SearchableSelect items={cities} value={editData.project_location?.split(', ')[0] || ''} onValueChange={handleCityChange} placeholder="Select city..." disabled={!selectedState} />
                    ) : (
                        <p className="text-base font-semibold">{project.project_location?.split(', ')[0] || 'N/A'}</p>
                    )}
                </div>

                {/* Phone */}
                <div>
                    <Label className="text-xs text-gray-500">{t('dashboard.customer_phone_label', 'Customer Phone')}</Label>
                    {isEditing ? (
                        <Input value={editData.phone_number} onChange={e => handleFieldChange('phone_number', e.target.value)} className="text-base"/>
                    ) : (
                        <p className="text-base font-semibold">{project.customer.phone_number || 'N/A'}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

interface ProjectDetailsModalProps {
    project: Project | null;
}

const statusColors: { [key: string]: string } = {
    'planning': 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
    'execution': 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
    'done': 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200',
    'archived': 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200',
};

// Helper function to calculate energy and power
const calculateApplianceMetrics = (appliance: ProjectAppliance) => {
    const energy = appliance.wattage * appliance.qty * appliance.use_hours_night;
    const power = appliance.wattage * appliance.qty;
    return { energy, power };
};

// --- Main Component ---
export function ProjectDetailsModal({ project }: ProjectDetailsModalProps) {
    const { t } = useTranslation();
    const { getCitiesByState, getClimateDataForCity } = useLocationData();

    // Appliance Store
    const {
        projectAppliances,
        isLoading: isApplianceLoading,
        error: applianceError,
        fetchAppliancesByProject,
        addApplianceToProject,
        updateProjectAppliance,
        removeApplianceFromProject
    } = useApplianceStore();

    // BLE Store
    const {
        results: bleResults,
        isLoading: isBleLoading,
        error: bleError,
        runCalculation,
        clearResults
    } = useBleStore();

    // State for custom appliance input
    const [customApplianceName, setCustomApplianceName] = useState('');
    const [customApplianceWattage, setCustomApplianceWattage] = useState<number | ''>('');
    const [customApplianceType, setCustomApplianceType] = useState<'light' | 'standard' | 'heavy'>('standard');
    
    // State for BLE settings overrides
    const [bleSettings, setBleSettings] = useState({
        inverter_efficiency: 0.95,
        safety_factor: 1.25,
        autonomy_days: 1,
        battery_type: 'liquid',
        battery_dod: 0.6,
        battery_rated_capacity_ah: 200,
        battery_rated_voltage: 12,
        panel_rated_power: 550,
    });

    useEffect(() => {
        if (project?.uuid) {
            clearResults();
            fetchAppliancesByProject(project.uuid);
        }
    }, [project?.uuid, clearResults, fetchAppliancesByProject]);


    const handleAddCustomAppliance = async () => {
        if (project && customApplianceName && customApplianceWattage > 0) {
            await addApplianceToProject({
                appliance_name: customApplianceName,
                wattage: customApplianceWattage,
                type: customApplianceType,
                qty: 1, 
                use_hours_night: 1
            }, project.uuid);
            // Reset fields
            setCustomApplianceName('');
            setCustomApplianceWattage('');
            setCustomApplianceType('standard');
        }
    };

    const handleUpdateAppliance = async (appliance_id: number, updates: Partial<Omit<ProjectAppliance, 'appliance_id'>>) => {
        try {
            await updateProjectAppliance(appliance_id, updates);
        } catch (error) {
            console.error("Failed to update appliance:", error);
            // Optionally show an error to the user
        }
    };

    const totalEnergy = useMemo(() => projectAppliances.reduce((sum, app) => sum + calculateApplianceMetrics(app).energy, 0), [projectAppliances]);
    const totalPower = useMemo(() => projectAppliances.reduce((sum, app) => sum + calculateApplianceMetrics(app).power, 0), [projectAppliances]);

    const handleRunCalculation = useCallback(async () => {
        if (!project?.project_id) return;
        try {
            await runCalculation(project.project_id, bleSettings);
        } catch (e) {
            console.error("Calculation process failed:", e);
        }
    }, [project?.project_id, runCalculation, bleSettings]);

    if (!project) {
        return null;
    }

    return (
        <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 bg-white">
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-2xl">{project.customer.full_name}'s Project</DialogTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className={cn(`font-semibold`, statusColors[project.status] || 'bg-gray-100', project.is_pending && "animate-pulse")}>
                        {project.is_pending ? t('dashboard.pending', 'Saving...') : t(`dashboard.status.${project.status}`, project.status)}
                    </Badge>
                    <span>{project.project_location}</span>
                </div>
            </DialogHeader>

            <div className="flex-grow grid grid-cols-2 overflow-hidden">
                {/* Left Column: Configuration */}
                <div className="flex flex-col p-6 overflow-y-auto border-r gap-6">
                    {/* Customer Info & Location */}
                    <div>
                        <h3 className="text-xl font-bold mb-4">{t('project_modal.customer_info_location', 'Customer Info & Location')}</h3>
                        <ProjectInfo project={project} />
                    </div>

                     {/* System Design Parameters */}
                    <div>
                        <Accordion type="single" collapsible>
                            <AccordionItem value="ble-settings">
                                <AccordionTrigger className="text-xl font-bold">{t('project_modal.design_parameters', 'System Design Parameters')}</AccordionTrigger>
                                <AccordionContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 pt-4">
                                        {/* --- Inverter --- */}
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-md border">
                                            <h4 className='font-semibold text-gray-700'>Inverter</h4>
                                            <SettingsInput
                                                label="Efficiency (%)"
                                                value={bleSettings.inverter_efficiency * 100}
                                                onChange={v => setBleSettings(s => ({...s, inverter_efficiency: v / 100}))}
                                                step={1}
                                            />
                                            <SettingsInput
                                                label="Safety Factor (%)"
                                                value={bleSettings.safety_factor * 100}
                                                onChange={v => setBleSettings(s => ({...s, safety_factor: v / 100}))}
                                                step={1}
                                            />
                                        </div>

                                        {/* --- Battery --- */}
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-md border">
                                            <h4 className='font-semibold text-gray-700'>Battery Bank</h4>
                                            <div>
                                                <Label className="text-xs font-medium text-gray-600">Battery Type</Label>
                                                <Select
                                                    value={bleSettings.battery_type}
                                                    onValueChange={(v: 'liquid' | 'lithium' | 'dry') => setBleSettings(s => ({...s, battery_type: v, battery_dod: v === 'lithium' ? 0.9 : 0.6}))}
                                                >
                                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="liquid">Lead-Acid (Liquid)</SelectItem>
                                                        <SelectItem value="dry">Lead-Acid (AGM/Gel)</SelectItem>
                                                        <SelectItem value="lithium">Lithium-ion</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <SettingsInput
                                                label="Depth of Discharge (DoD %)"
                                                value={bleSettings.battery_dod * 100}
                                                onChange={v => setBleSettings(s => ({...s, battery_dod: v / 100}))}
                                                step={1}
                                            />
                                            <SettingsInput
                                                label="Capacity per Unit (Ah)"
                                                value={bleSettings.battery_rated_capacity_ah}
                                                onChange={v => setBleSettings(s => ({...s, battery_rated_capacity_ah: v}))}
                                                step={10}
                                            />
                                            <SettingsInput
                                                label="Voltage per Unit (V)"
                                                value={bleSettings.battery_rated_voltage}
                                                onChange={v => setBleSettings(s => ({...s, battery_rated_voltage: v}))}
                                                step={12}
                                            />
                                             <SettingsInput
                                                label="Days of Autonomy"
                                                value={bleSettings.autonomy_days}
                                                onChange={v => setBleSettings(s => ({...s, autonomy_days: v}))}
                                                step={1}
                                            />
                                        </div>

                                        {/* --- Panels --- */}
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-md border">
                                             <h4 className='font-semibold text-gray-700'>Solar Array</h4>
                                             <SettingsInput
                                                label="Panel Power (W)"
                                                value={bleSettings.panel_rated_power}
                                                onChange={v => setBleSettings(s => ({...s, panel_rated_power: v}))}
                                                step={10}
                                            />
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>

                    <div>
                        <h3 className="text-xl font-bold mb-4">{t('project_modal.appliance_calculator', 'Appliance Calculator')}</h3>
                        
                        {/* Custom Appliance Input Form */}
                        <div className="grid grid-cols-12 gap-2 p-3 mb-4 border rounded-lg bg-gray-50">
                            <div className="col-span-5">
                                <Label htmlFor='appliance-name' className='text-xs text-gray-500 font-semibold'>Appliance Name</Label>
                                <Input
                                    id='appliance-name'
                                    placeholder={t('project_modal.add_appliance_name', 'e.g., Refrigerator')}
                                    value={customApplianceName}
                                    onChange={(e) => setCustomApplianceName(e.target.value)}
                                    className="bg-white"
                                />
                            </div>
                            <div className="col-span-2">
                                <Label htmlFor='appliance-wattage' className='text-xs text-gray-500 font-semibold'>Wattage (W)</Label>
                                <Input
                                    id='appliance-wattage'
                                    type="number"
                                    placeholder={t('project_modal.add_appliance_wattage', 'e.g., 150')}
                                    value={customApplianceWattage}
                                    onChange={(e) => setCustomApplianceWattage(Number(e.target.value))}
                                    className="bg-white"
                                />
                            </div>
                            <div className="col-span-3">
                                <Label htmlFor='appliance-type' className='text-xs text-gray-500 font-semibold'>Type</Label>
                                <Select value={customApplianceType} onValueChange={(v: any) => setCustomApplianceType(v)}>
                                    <SelectTrigger id='appliance-type' className="bg-white">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="light">Light</SelectItem>
                                        <SelectItem value="standard">Standard</SelectItem>
                                        <SelectItem value="heavy">Heavy</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="col-span-2 flex items-end">
                                <Button
                                    onClick={handleAddCustomAppliance}
                                    disabled={!customApplianceName || !customApplianceWattage || customApplianceWattage <= 0}
                                    className="w-full"
                                >
                                    <PlusIcon className="h-4 w-4 mr-2" /> {t('project_modal.add', 'Add')}
                                </Button>
                            </div>
                        </div>

                        {isApplianceLoading && projectAppliances.length === 0 && <Spinner className="w-8 h-8 mx-auto" />}
                        {applianceError && <Alert variant="destructive"><AlertTitle><AlertCircle className="h-4 w-4" /> Error</AlertTitle><AlertDescription>{applianceError}</AlertDescription></Alert>}
                        
                        <ScrollArea className="flex-grow h-[300px] mb-4 rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[150px]">{t('project_modal.appliance', 'Appliance')}</TableHead>
                                        <TableHead className="w-[80px] text-center">{t('project_modal.qty', 'Qty')}</TableHead>
                                        <TableHead className="w-[100px] text-center">{t('project_modal.hours', 'Hrs/Day')}</TableHead>
                                        <TableHead className="w-[100px] text-center">{t('project_modal.surge', 'Surge')}</TableHead>
                                        <TableHead className="w-[100px] text-center">{t('project_modal.power', 'Power (W)')}</TableHead>
                                        <TableHead className="w-[120px] text-center">{t('project_modal.energy', 'Energy (Wh/day)')}</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {projectAppliances.map((app) => (
                                        <TableRow key={app.appliance_id}>
                                            <TableCell className="font-medium">{app.appliance_name}</TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    value={app.qty}
                                                    onChange={(e) => handleUpdateAppliance(app.appliance_id, { qty: parseInt(e.target.value) || 0 })}
                                                    className="w-full text-center p-1 h-8"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Input
                                                    type="number"
                                                    value={app.use_hours_night}
                                                    onChange={(e) => handleUpdateAppliance(app.appliance_id, { use_hours_night: parseInt(e.target.value) || 0 })}
                                                    className="w-full text-center p-1 h-8"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Switch
                                                    checked={app.type === 'heavy'}
                                                    onCheckedChange={(checked) => handleUpdateAppliance(app.appliance_id, { type: checked ? 'heavy' : 'standard' })}
                                                    className="scale-75"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center">{calculateApplianceMetrics(app).power}</TableCell>
                                            <TableCell className="text-center">{calculateApplianceMetrics(app).energy}</TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeApplianceFromProject(app.appliance_id)}>
                                                    <MinusIcon className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                        <div className="flex justify-between items-center px-4 py-2 border-t font-bold">
                            <span>{t('project_modal.total_load', 'Total Load:')}</span>
                            <span>{t('project_modal.total_power', 'Power')}: {totalPower} W</span>
                            <span>{t('project_modal.total_energy', 'Energy')}: {totalEnergy} Wh/day</span>
                        </div>
                    </div>
                    
                    <Button
                        onClick={handleRunCalculation}
                        disabled={projectAppliances.length === 0 || isBleLoading}
                        className="w-full mt-auto text-white"
                    >
                        {isBleLoading ? <Spinner className="mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                        {t('project_modal.calculate', 'Calculate')}
                    </Button>
                </div>


                {/* Right Column: BLE Results */}
                <div className="flex flex-col p-6 overflow-y-auto">
                    <h3 className="text-xl font-bold mb-4">{t('project_modal.ble_results', 'System Analysis Results')}</h3>

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

                    {!isBleLoading && !bleError && !bleResults && (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <Calculator className="w-16 h-16 mb-4 text-gray-300" />
                            <p className="font-semibold">{t('project_modal.no_results_title', 'No Results Yet')}</p>
                            <p className="text-sm">{t('project_modal.no_results_subtitle', 'Click "Calculate" to run the system analysis.')}</p>
                        </div>
                    )}

                    {bleResults && bleResults.data && (
                        <ScrollArea className="flex-grow">
                            <Accordion type="multiple" defaultValue={['metadata', 'solar_panels', 'inverter', 'battery_bank']} className="w-full">
                                <AccordionItem value="metadata">
                                    <AccordionTrigger>Metadata</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label="Peak Sun Hours" value={bleResults.data.metadata.peak_sun_hours} />
                                            <DataRow label="Total System Size" value={`${parseFloat(bleResults.data.metadata.total_system_size_kw).toFixed(2)} kW`} />
                                            <DataRow label="Peak Surge Power" value={`${bleResults.data.metadata.peak_surge_power_w} W`} />
                                            <DataRow label="Autonomy Days" value={bleResults.data.metadata.autonomy_days} />
                                            <DataRow label="Total Daily Energy" value={`${bleResults.data.metadata.total_daily_energy_wh} Wh`} />
                                            <DataRow label="Total Peak Power" value={`${bleResults.data.metadata.total_peak_power_w} W`} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="solar_panels">
                                    <AccordionTrigger>Solar Panels</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label="Power Rating" value={`${bleResults.data.solar_panels.power_rating_w} W`} />
                                            <DataRow label="Quantity" value={bleResults.data.solar_panels.quantity} />
                                            <DataRow label="Total PV Capacity" value={`${parseFloat(bleResults.data.solar_panels.total_pv_capacity_kw).toFixed(2)} kW`} />
                                            <DataRow label="Panels per String" value={bleResults.data.solar_panels.panels_per_string} />
                                            <DataRow label="Num. Parallel Strings" value={bleResults.data.solar_panels.num_parallel_strings} />
                                            <DataRow label="Connection Type" value={bleResults.data.solar_panels.connection_type} />
                                            <DataRow label="Tilt Angle" value={`${bleResults.data.solar_panels.tilt_angle}°`} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="inverter">
                                    <AccordionTrigger>Inverter</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label="Power Rating" value={`${bleResults.data.inverter.power_rating_w} W`} />
                                            <DataRow label="Quantity" value={bleResults.data.inverter.quantity} />
                                            <DataRow label="Surge Rating" value={`${bleResults.data.inverter.surge_rating_w} W`} />
                                            <DataRow label="Efficiency" value={`${bleResults.data.inverter.efficiency_percent}%`} />
                                            <DataRow label="Output Voltage" value={`${bleResults.data.inverter.output_voltage_v} V`} />
                                            <DataRow label="Connection Type" value={bleResults.data.inverter.connection_type} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="battery_bank">
                                    <AccordionTrigger>Battery Bank</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <DataRow label="Battery Type" value={bleResults.data.battery_bank.battery_type} />
                                            <DataRow label="Capacity per Unit" value={`${bleResults.data.battery_bank.capacity_per_unit_ah} Ah`} />
                                            <DataRow label="Voltage per Unit" value={`${bleResults.data.battery_bank.voltage_per_unit_v} V`} />
                                            <DataRow label="Quantity" value={bleResults.data.battery_bank.quantity} />
                                            <DataRow label="Num in Series" value={bleResults.data.battery_bank.num_in_series} />
                                            <DataRow label="Num in Parallel" value={bleResults.data.battery_bank.num_in_parallel} />
                                            <DataRow label="Total Storage" value={`${parseFloat(bleResults.data.battery_bank.total_storage_kwh).toFixed(2)} kWh`} />
                                            <DataRow label="Depth of Discharge" value={`${bleResults.data.battery_bank.depth_of_discharge_percent}%`} />
                                            <DataRow label="System Voltage" value={`${bleResults.data.battery_bank.system_voltage_v} V`} />
                                            <DataRow label="Connection Type" value={bleResults.data.battery_bank.connection_type} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                            <div className="mt-6">
                                <BleResultsChart results={bleResults.data} />
                            </div>
                        </ScrollArea>
                    )}
                </div>
            </div>
        </DialogContent>
    );
}

const SettingsInput = ({ label, value, onChange, step = 1 }: { label: string, value: number, onChange: (value: number) => void, step?: number }) => (
    <div>
        <Label className="text-xs font-medium text-gray-600">{label}</Label>
        <Input
            type="number"
            value={value}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="h-9"
            step={step}
        />
    </div>
);

const DataRow = ({ label, value, unit = '' }: { label: string; value: any; unit?: string }) => {
    if (value === null || value === undefined || value === "N/A") {
        return null;
    }
    return (
        <div className="flex justify-between py-1 border-b border-gray-100">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm font-semibold text-gray-800">{String(value)} {unit}</span>
        </div>
    );
};

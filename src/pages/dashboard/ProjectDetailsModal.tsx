import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { ScrollArea } from '@/components/ui/scroll-area'; // Corrected import for ScrollArea
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useLocationData } from '@/hooks/useLocationData';
import { useApplianceStore, ProjectAppliance, LibraryAppliance } from '@/store/useApplianceStore';
import { useBleStore, BleCalculationResults } from '@/store/useBleStore';
import { Project } from "@/store/useProjectStore";
import { BleResultsChart } from './BleResultsChart';
import { cn } from "@/lib/utils";
import { PlusIcon, MinusIcon, Calculator, AlertCircle } from 'lucide-react';

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
    const { t, i18n } = useTranslation();
    const { getCitiesByState, getClimateDataForCity } = useLocationData(); // Destructure getClimateDataForCity

    // Appliance Store
    const {
        library: applianceLibrary,
        projectAppliances,
        isLoading: isApplianceLoading,
        error: applianceError,
        fetchApplianceLibrary,
        setProjectAppliances,
        addApplianceToProject,
        updateProjectAppliance,
        removeApplianceFromProject,
        saveAppliancesForProject
    } = useApplianceStore();

    // BLE Store
    const {
        results: bleResults,
        isLoading: isBleLoading,
        error: bleError,
        runCalculation,
        clearResults
    } = useBleStore();

    const [selectedLibraryAppliance, setSelectedLibraryAppliance] = useState<string>('');
    const [customApplianceName, setCustomApplianceName] = useState('');
    const [customApplianceWattage, setCustomApplianceWattage] = useState<number | ''>('');
    const [customApplianceSurge, setCustomApplianceSurge] = useState<number | ''>('');

    const [projectLocationCity, setProjectLocationCity] = useState<string>(''); // To extract city from full location string
    const [projectLocationState, setProjectLocationState] = useState<string>(''); // To extract state from full location string

    // Derived climate data
    const climateData = useMemo(() => {
        return getClimateDataForCity(projectLocationCity, projectLocationState);
    }, [projectLocationCity, projectLocationState, getClimateDataForCity]);

    useEffect(() => {
        if (project?.project_id) {
            fetchApplianceLibrary();
            clearResults();
            // In a real app, you'd fetch existing project appliances here
            // setProjectAppliances(fetchAppliancesForProject(project.project_id));
        }
    }, [project?.project_id, fetchApplianceLibrary, clearResults]);

    useEffect(() => {
        if (project?.project_location) {
            const parts = project.project_location.split(', ').map(p => p.trim());
            if (parts.length === 2) {
                setProjectLocationCity(parts[0]);
                setProjectLocationState(parts[1]);
            } else {
                setProjectLocationCity(project.project_location);
                setProjectLocationState('');
            }
        } else {
            setProjectLocationCity('');
            setProjectLocationState('');
        }
    }, [project?.project_location]);


    const totalEnergy = useMemo(() => projectAppliances.reduce((sum, app) => sum + calculateApplianceMetrics(app).energy, 0), [projectAppliances]);
    const totalPower = useMemo(() => projectAppliances.reduce((sum, app) => sum + calculateApplianceMetrics(app).power, 0), [projectAppliances]);

    const handleRunCalculation = useCallback(async () => {
        if (!project?.project_id) return;
        try {
            await saveAppliancesForProject(project.project_id);
            await runCalculation(project.project_id);
        } catch (e) {
            console.error("Calculation process failed:", e);
        }
    }, [project?.project_id, saveAppliancesForProject, runCalculation]);

    if (!project) {
        return null;
    }

    return (
        <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 bg-white">
            <DialogHeader className="p-4 border-b">
                <DialogTitle className="text-2xl">{project.customer.full_name}'s Project</DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                    <Badge variant="outline" className={cn(`font-semibold`, statusColors[project.status] || 'bg-gray-100')}>
                        {project.is_pending ? t('dashboard.pending', 'Pending...') : t(`dashboard.status.${project.status}`, project.status)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{project.project_location}</span>
                </DialogDescription>
            </DialogHeader>

            <div className="flex-grow grid grid-cols-2 overflow-hidden">
                {/* Left Column: Configuration */}
                <div className="flex flex-col p-6 overflow-y-auto border-r">
                    <h3 className="text-xl font-bold mb-4">{t('project_modal.customer_info_location', 'Customer Info & Location')}</h3>
                    <div className="grid gap-4 mb-8">
                        <div className="grid gap-2">
                            <Label className="font-semibold">{t('dashboard.customer_name_label', 'Customer Name')}</Label>
                            <Input value={project.customer.full_name} readOnly className="bg-gray-100" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label className="font-semibold">{t('dashboard.customer_email_label', 'Customer Email')}</Label>
                                <Input value={project.customer.email || 'N/A'} readOnly className="bg-gray-100" />
                            </div>
                            <div className="grid gap-2">
                                <Label className="font-semibold">{t('dashboard.customer_phone_label', 'Customer Phone')}</Label>
                                <Input value={project.customer.phone_number || 'N/A'} readOnly className="bg-gray-100" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label className="font-semibold">{t('dashboard.state_label', 'State')}</Label>
                                <Input value={projectLocationState || 'N/A'} readOnly className="bg-gray-100" />
                            </div>
                            <div className="grid gap-2">
                                <Label className="font-semibold">{t('dashboard.city_label', 'City')}</Label>
                                <Input value={projectLocationCity || 'N/A'} readOnly className="bg-gray-100" />
                            </div>
                        </div>
                        {climateData && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label className="font-semibold">{t('project_modal.irradiance', 'Irradiance (GTI)')}</Label>
                                    <Input value={`${climateData.gti} kWh/m²/day`} readOnly className="bg-gray-100" />
                                </div>
                                <div className="grid gap-2">
                                    <Label className="font-semibold">{t('project_modal.temperature', 'Avg. Temp (°C)')}</Label>
                                    <Input value={`${climateData.temp} °C`} readOnly className="bg-gray-100" />
                                </div>
                            </div>
                        )}
                    </div>

                    <h3 className="text-xl font-bold mb-4">{t('project_modal.appliance_calculator', 'Appliance Calculator')}</h3>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="flex-grow">
                            <SearchableSelect
                                items={applianceLibrary.map(app => ({ value: app.name, label: app.name }))}
                                value={selectedLibraryAppliance}
                                onValueChange={(value) => setSelectedLibraryAppliance(value)}
                                placeholder={t('project_modal.search_appliances', 'Search appliances...')}
                                disabled={isApplianceLoading}
                            />
                        </div>
                        <Button
                            onClick={() => {
                                const app = applianceLibrary.find(a => a.name === selectedLibraryAppliance);
                                if (app) {
                                    addApplianceToProject(app);
                                    setSelectedLibraryAppliance('');
                                }
                            }}
                            disabled={!selectedLibraryAppliance || isApplianceLoading}
                            className="flex-shrink-0"
                        >
                            <PlusIcon className="h-4 w-4 mr-2" /> {t('project_modal.add', 'Add')}
                        </Button>
                    </div>

                    {isApplianceLoading && <Spinner className="w-8 h-8 mx-auto" />}
                    {applianceError && <Alert variant="destructive"><AlertTitle><AlertCircle className="h-4 w-4" /> Error</AlertTitle><AlertDescription>{applianceError}</AlertDescription></Alert>}

                    <ScrollArea className="flex-grow h-px mb-4 rounded-md border">
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
                                    <TableRow key={app.id}>
                                        <TableCell className="font-medium">{app.appliance_name}</TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={app.qty}
                                                onChange={(e) => updateProjectAppliance(app.id, { qty: parseInt(e.target.value) || 0 })}
                                                className="w-full text-center p-1 h-8"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={app.use_hours_night}
                                                onChange={(e) => updateProjectAppliance(app.id, { use_hours_night: parseInt(e.target.value) || 0 })}
                                                className="w-full text-center p-1 h-8"
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Switch
                                                checked={app.type === 'heavy'}
                                                onCheckedChange={(checked) => updateProjectAppliance(app.id, { type: checked ? 'heavy' : 'standard' })}
                                                className="scale-75"
                                            />
                                        </TableCell>
                                        <TableCell className="text-center">{calculateApplianceMetrics(app).power}</TableCell>
                                        <TableCell className="text-center">{calculateApplianceMetrics(app).energy}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => removeApplianceFromProject(app.id)}>
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

                    <Button
                        onClick={handleRunCalculation}
                        disabled={projectAppliances.length === 0 || isBleLoading}
                        className="w-full mt-4 text-white"
                    >
                        {isBleLoading ? <Spinner className="mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
                        {t('project_modal.calculate', 'Calculate')}
                    </Button>
                </div>

                {/* Right Column: BLE Results */}
                <div className="flex flex-col p-6 overflow-y-auto">
                    <h3 className="text-xl font-bold mb-4">{t('project_modal.ble_results', 'BLE Calculation Results')}</h3>
                    {isBleLoading ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <Spinner className="w-12 h-12 mb-4" />
                            <p className="text-muted-foreground">{t('project_modal.calculating', 'Calculating system...')}</p>
                        </div>
                    ) : bleError ? (
                        <Alert variant="destructive">
                            <AlertTitle><AlertCircle className="h-4 w-4" /> {t('project_modal.error', 'Error')}</AlertTitle>
                            <AlertDescription>{bleError}</AlertDescription>
                        </Alert>
                    ) : bleResults ? (
                        <div className="space-y-6">
                            <BleResultsChart results={bleResults.data} />

                            <h4 className="text-lg font-semibold mt-6 mb-3">{t('project_modal.detailed_breakdown', 'Detailed Breakdown')}</h4>
                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="solar-panels">
                                    <AccordionTrigger>{t('project_modal.solar_panels', 'Solar Panels')}</AccordionTrigger>
                                    <AccordionContent>
                                        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                                            <li>{t('ble.solar_panels.quantity', 'Quantity')}: {bleResults.data?.solar_panels.quantity}</li>
                                            <li>{t('ble.solar_panels.total_capacity', 'Total PV Capacity')}: {bleResults.data?.solar_panels.total_pv_capacity_kw} kW</li>
                                            <li>{t('ble.solar_panels.connection', 'Connection')}: {bleResults.data?.solar_panels.connection_type}</li>
                                            <li>{t('ble.solar_panels.panels_per_string', 'Panels/String')}: {bleResults.data?.solar_panels.panels_per_string}</li>
                                            <li>{t('ble.solar_panels.num_strings', 'Parallel Strings')}: {bleResults.data?.solar_panels.num_parallel_strings}</li>
                                        </ul>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="inverter">
                                    <AccordionTrigger>{t('project_modal.inverter', 'Inverter')}</AccordionTrigger>
                                    <AccordionContent>
                                        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                                            <li>{t('ble.inverter.quantity', 'Quantity')}: {bleResults.data?.inverter.quantity}</li>
                                            <li>{t('ble.inverter.power_rating', 'Power Rating')}: {bleResults.data?.inverter.power_rating_w} W</li>
                                            <li>{t('ble.inverter.surge_rating', 'Surge Rating')}: {bleResults.data?.inverter.surge_rating_w} W</li>
                                            <li>{t('ble.inverter.efficiency', 'Efficiency')}: {bleResults.data?.inverter.efficiency_percent}%</li>
                                        </ul>
                                    </AccordionContent>
                                </AccordionItem>
                                <AccordionItem value="battery-bank">
                                    <AccordionTrigger>{t('project_modal.battery_bank', 'Battery Bank')}</AccordionTrigger>
                                    <AccordionContent>
                                        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                                            <li>{t('ble.battery_bank.quantity', 'Quantity')}: {bleResults.data?.battery_bank.quantity}</li>
                                            <li>{t('ble.battery_bank.total_storage', 'Total Storage')}: {bleResults.data?.battery_bank.total_storage_kwh} kWh</li>
                                            <li>{t('ble.battery_bank.system_voltage', 'System Voltage')}: {bleResults.data?.battery_bank.system_voltage_v} V</li>
                                            <li>{t('ble.battery_bank.connection', 'Connection')}: {bleResults.data?.battery_bank.connection_type}</li>
                                        </ul>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>

                            <Button className="w-full mt-6 text-white">
                                {t('project_modal.proceed_selection', 'Proceed to Component Selection')}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            {t('project_modal.awaiting_calculation', 'Enter appliances and hit Calculate to see results.')}
                        </div>
                    )}
                </div>
            </div>
        </DialogContent>
    );
}



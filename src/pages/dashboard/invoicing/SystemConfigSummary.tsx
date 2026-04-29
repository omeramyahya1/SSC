import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Zap, BatteryCharging, Sun, Info } from 'lucide-react';

interface SystemConfigSummaryProps {
    data: any;
    className?: string;
}

export function SystemConfigSummary({ data, className }: SystemConfigSummaryProps) {
    const { t, i18n } = useTranslation();

    if (!data) return null;

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

    const DataRow = ({ label, value, unit = '', formatter }: { label: string; value: any; unit?: string; formatter?: (val: any) => string }) => {
        if (value === null || value === undefined || value === "N/A") {
            return null;
        }
        const displayValue = formatter ? formatter(value) : String(value);
        return (
            <div className="py-1.5 border-b border-gray-100 flex justify-between gap-4">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-semibold text-gray-800">{displayValue} {unit}</span>
            </div>
        );
    };

    const Section = ({ title, icon: Icon, children, colorClass }: { title: string, icon: any, children: React.ReactNode, colorClass: string }) => (
        <div className="mb-6 last:mb-0 break-inside-avoid">
            <h4 className={cn("text-base font-bold mb-3 flex items-center gap-2", colorClass)}>
                <Icon className="h-5 w-5" />
                <span>{title}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                {children}
            </div>
        </div>
    );

    return (
        <div className={cn("bg-white p-6 rounded-xl border print:border-none", className)} dir={i18n.dir()}>
            <h3 className="text-xl font-bold mb-6 border-b pb-2">{t('project_modal.system_configuration', 'System Configuration')}</h3>
            
            <Section title={t('project_modal.metadata_accordion_title', 'Metadata')} icon={Info} colorClass="text-blue-600">
                <DataRow label={t('ble.metadata.peak_sun_hours', 'Peak Sun Hours')} value={data.metadata?.peak_sun_hours} />
                <DataRow label={t('ble.metadata.total_system_size', 'Total System Size')} value={data.metadata?.total_system_size_kw} unit="kW" formatter={(val) => Number(val).toFixed(2)} />
                <DataRow label={t('ble.metadata.peak_surge_power', 'Peak Surge Power')} value={data.metadata?.peak_surge_power_w} formatter={formatPowerValue} />
                <DataRow label={t('ble.metadata.autonomy_days', 'Autonomy Days')} value={data.metadata?.autonomy_days} />
                <DataRow label={t('ble.metadata.total_daily_energy', 'Total Daily Energy')} value={data.metadata?.total_daily_energy_wh} formatter={formatEnergyValue} />
                <DataRow label={t('ble.metadata.total_peak_power', 'Total Peak Power')} value={data.metadata?.total_peak_power_w} formatter={formatPowerValue} />
            </Section>

            <Section title={t('project_modal.solar_panels', 'Solar Panels')} icon={Sun} colorClass="text-orange-500">
                <DataRow label={t('ble.solar_panels.power_rating', 'Power Rating')} value={data.solar_panels?.power_rating_w} formatter={formatPowerValue} />
                <DataRow label={t('ble.solar_panels.quantity', 'Quantity')} value={data.solar_panels?.quantity} />
                <DataRow label={t('ble.solar_panels.total_capacity', 'Total PV Capacity')} value={data.metadata?.total_system_size_kw} unit="kW" formatter={(val) => Number(val).toFixed(2)} />
                <DataRow label={t('ble.solar_panels.panels_per_string', 'Panels per String')} value={data.solar_panels?.panels_per_string} />
                <DataRow label={t('ble.solar_panels.num_strings', 'Num. Parallel Strings')} value={data.solar_panels?.num_parallel_strings} />
                <DataRow label={t('ble.solar_panels.connection', 'Connection Type')} value={data.solar_panels?.connection_type} />
            </Section>

            <Section title={t('project_modal.inverter', 'Inverter')} icon={Zap} colorClass="text-yellow-500">
                <DataRow label={t('ble.inverter.power_rating', 'Power Rating')} value={data.inverter?.power_rating_w} formatter={formatPowerValue} />
                <DataRow label={t('ble.inverter.quantity', 'Quantity')} value={data.inverter?.quantity} />
                <DataRow label={t('ble.inverter.recommended_rating', 'Recommended Rating')} value={data.inverter?.recommended_rating} formatter={formatPowerValue} />
                <DataRow label={t('ble.inverter.efficiency', 'Efficiency')} value={data.inverter?.efficiency_percent ? `${data.inverter.efficiency_percent}%` : null} />
                <DataRow label={t('ble.inverter.surge_rating', 'Surge Rating')} value={data.inverter?.surge_rating_w} formatter={formatPowerValue} />
            </Section>

            <Section title={t('project_modal.battery_bank', 'Battery Bank')} icon={BatteryCharging} colorClass="text-green-500">
                <DataRow label={t('ble.battery_bank.battery_type', 'Battery Type')} value={data.battery_bank?.battery_type} />
                <DataRow label={t('ble.battery_bank.capacity_per_unit', 'Capacity per Unit')} value={data.battery_bank?.capacity_per_unit_ah ? `${data.battery_bank.capacity_per_unit_ah} Ah` : null} />
                <DataRow label={t('ble.battery_bank.voltage_per_unit', 'Voltage per Unit')} value={data.battery_bank?.voltage_per_unit_v ? `${data.battery_bank.voltage_per_unit_v} V` : null} />
                <DataRow label={t('ble.battery_bank.quantity', 'Quantity')} value={data.battery_bank?.quantity} />
                <DataRow label={t('ble.battery_bank.total_storage', 'Total Storage')} value={data.battery_bank?.total_storage_kwh} unit="kWh" formatter={(val) => Number(val).toFixed(2)} />
                <DataRow label={t('ble.battery_bank.system_voltage', 'System Voltage')} value={data.battery_bank?.system_voltage_v ? `${data.battery_bank.system_voltage_v} V` : null} />
            </Section>
        </div>
    );
}

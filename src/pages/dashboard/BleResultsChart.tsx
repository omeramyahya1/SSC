// src/pages/dashboard/BleResultsChart.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { BleCalculationResults } from '@/store/useBleStore';
import { cn } from "@/lib/utils";

interface BleResultsChartProps {
  results: BleCalculationResults['data'];
}

export function BleResultsChart({ results }: BleResultsChartProps) {
  const { t } = useTranslation();

  if (!results) {
    return null;
  }

  const data = [
    {
      name: t('ble.chart.daily_energy', 'Daily Energy (Wh)'),
      value: results.metadata.total_daily_energy_wh,
      max: results.battery_bank.total_storage_kwh * 1000, // Total battery energy capacity
      color: 'bg-blue-500'
    },
    {
      name: t('ble.chart.pv_capacity', 'PV Energy (Wh)'),
      value: results.solar_panels.total_pv_capacity_kw * 1000, // Total energy provided by solar panels
      max: results.metadata.total_daily_energy_wh, // Total energy required by the system
      color: 'bg-yellow-500'
    },
    {
      name: t('ble.chart.inverter_capacity', 'Inverter Power (W)'),
      value: results.inverter.power_rating_w, // Total rated power of the inverter
      max: results.metadata.total_peak_power_w, // Total power needed by the system
      color: 'bg-red-500'
    },
  ];

  // Find overall max value for consistent scaling across all bars
  const overallMaxValue = Math.max(...data.map(item => item.max || item.value || 0));

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow-inner">
      <h3 className="text-lg font-semibold mb-4">{t('ble.chart.summary', 'System Summary')}</h3>
      <div className="space-y-4">
        {data.map((item, index) => {
          if (item.value === null || item.value === undefined) {
            return null; // Explicitly return null if value is invalid
          }
          return (
            <div key={index} className="flex flex-col">
              <div className="flex justify-between text-sm font-medium mb-1">
                <span>{item.name}</span>
                <span>{item.value.toLocaleString()} {item.name.includes('(Wh)') ? 'Wh' : 'W'}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", item.color)}
                  style={{ width: `${((item.value / item.max) * 100) || 0}%` }} // Scale against its own max
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}

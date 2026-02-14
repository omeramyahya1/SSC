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
      color: 'bg-blue-500'
    },
    {
      name: t('ble.chart.peak_power', 'Peak Power (W)'),
      value: results.metadata.total_peak_power_w,
      color: 'bg-green-500'
    },
    {
      name: t('ble.chart.pv_capacity', 'PV Capacity (kW)'),
      value: results.solar_panels.total_pv_capacity_kw * 1000, // Convert to W for comparison
      color: 'bg-yellow-500'
    },
    {
      name: t('ble.chart.inverter_capacity', 'Inverter Cap. (W)'),
      value: results.inverter.power_rating_w,
      color: 'bg-red-500'
    },
  ];

  // Find max value for scaling
  const maxValue = Math.max(...data.map(item => item.value || 0));

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow-inner">
      <h3 className="text-lg font-semibold mb-4">{t('ble.chart.summary', 'System Summary')}</h3>
      <div className="space-y-4">
        {data.map((item, index) => (
          item.value !== null && item.value !== undefined && (
            <div key={index} className="flex flex-col">
              <div className="flex justify-between text-sm font-medium mb-1">
                <span>{item.name}</span>
                <span>{item.value.toLocaleString()} {item.name.includes('(Wh)') ? 'Wh' : item.name.includes('(W)') ? 'W' : 'W'}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", item.color)}
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                ></div>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

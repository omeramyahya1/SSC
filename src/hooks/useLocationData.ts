// src/hooks/useLocationData.ts
import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import geoDataCsv from '@/assets/dataset/geo_data.csv?raw';

// --- Helper Functions ---

const parseCsv = (csv: string): any[] => {
    const lines = csv.split('\n');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const currentLine = lines[i].split(',');
        const obj: any = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = currentLine[j]?.trim();
        }
        data.push(obj);
    }
    return data;
};

const toTitleCase = (str: string): string => {
  if (!str) return '';
  return str.replace(
    /\w\S*/g,
    text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
};

// --- Main Hook ---

const geoDataParsed = parseCsv(geoDataCsv);

export const useLocationData = () => {
    const { i18n } = useTranslation();

    const uniqueStates = useMemo(() => {
        const states = Array.from(new Set(geoDataParsed.map(item => item.state)));
        return states.map(stateName => {
            const entry = geoDataParsed.find(item => item.state === stateName);
            return {
                value: entry.state, // Always English value for backend consistency
                label: i18n.language === 'ar' ? entry.state_ar : toTitleCase(entry.state),
            };
        }).sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically
    }, [i18n.language]);

    const getCitiesByState = (state: string | null) => {
        if (!state) return [];
        return geoDataParsed
            .filter(item => item.state === state)
            .map(item => ({
                value: item.city, // Always English value
                label: i18n.language === 'ar' ? item.city_ar : toTitleCase(item.city),
            }))
            .sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically
    };

    const getClimateDataForCity = useCallback((city: string | null, state: string | null) => {
        if (!city || !state) return null;
        return geoDataParsed.find((item: any) => 
            item.city.toLowerCase() === city.toLowerCase() &&
            item.state.toLowerCase() === state.toLowerCase()
        ) || null;
    }, []);

    return { states: uniqueStates, getCitiesByState, getClimateDataForCity };
};

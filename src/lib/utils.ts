import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import i18n from 'i18next'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | undefined | null) {
  if (amount === undefined || amount === null) return '0';
  const language = i18n.language || 'en';
  
  const formattedAmount = new Intl.NumberFormat(language === 'ar' ? 'ar-SD' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  const symbol = i18n.t('currency.sdg', { defaultValue: language === 'ar' ? 'ج' : 'SDG' });
  
  return `${formattedAmount} ${symbol}`;
}

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from "framer-motion";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ArrowLeft, AlertCircle, Mail, Phone, Building, MessageCircle, Calendar, ChevronsUpDown, Check } from "lucide-react";
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useRegistrationStore } from '@/store/useRegistrationStore';
import useLocalStorage from '@/hooks/useLocalStorage';
import { cn } from "@/lib/utils";

// Import CSV raw
import geoDataCsv from '@/assets/dataset/geo_data.csv?raw';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

// --- Helper Functions & Utilities (Copied from registration.tsx) ---
const parseCsv = (csv: string) => {
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const currentLine = lines[i].split(',');
        const obj: any = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j].trim()] = currentLine[j]?.trim();
        }
        data.push(obj);
    }
    return data;
};

const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.replace(
    /\w\S*/g,
    text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
};

// Memoize parsed CSV data outside component
const geoDataParsed = parseCsv(geoDataCsv);
const uniqueStates = Array.from(new Set(geoDataParsed.map(item => item.state))).map(stateName => {
    const entry = geoDataParsed.find(item => item.state === stateName);
    return {
        value: entry.state,
        label_en: toTitleCase(entry.state),
        label_ar: entry.state_ar
    };
});

// Reusable SearchableSelect component
const SearchableSelect = ({ items, value, onValueChange, placeholder, disabled }: any) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    const selectedLabel = items.find((item: any) => item.value === value)?.label;

    return (
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
                "w-full justify-between px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-xl focus:shadow-md hover:bg-white bg-white font-normal",
                !value && "text-muted-foreground",
                disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={disabled}
            >
            {value ? selectedLabel : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white rounded-xl">
            <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
                <CommandEmpty>{t('common.search.no_results', 'No results found.')}</CommandEmpty>
                <CommandGroup>
                {items.map((item: any) => (
                    <CommandItem
                    key={item.value}
                    value={item.label} // Search by label
                    className='hover:bg-primary-gray rounded-lg cursor-pointer'
                    onSelect={(currentValue) => {
                        // We need the value, not the label
                        // But cmdk uses label as value often if not specified
                        // Here we map back
                        const original = items.find((i: any) => i.label.toLowerCase() === currentValue.toLowerCase()) || items.find((i:any) => i.label === currentValue);
                        onValueChange(original?.value || currentValue);
                        setOpen(false);
                    }}
                    >
                    <Check
                        className={cn(
                        "mr-2 h-4 w-4",
                        value === item.value ? "opacity-100" : "opacity-0"
                        )}
                    />
                    {item.label}
                    </CommandItem>
                ))}
                </CommandGroup>
            </CommandList>
            </Command>
        </PopoverContent>
        </Popover>
    );
};

// --- Constants ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9\s-()]{7,20}$/; // Basic international phone number regex

const ContactSales = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { formData } = useRegistrationStore(); // Access registration data for pre-fill

    // Form states
    const [enterpriseName, setEnterpriseName] = useState(formData.stage4.businessName || '');
    const [locationState, setLocationState] = useState(formData.stage4.locationState || '');
    const [locationCity, setLocationCity] = useState(formData.stage4.locationCity || '');
    const [contactEmail, setContactEmail] = useState(formData.stage1.email || '');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [meetingPreference, setMeetingPreference] = useState('');
    const [message, setMessage] = useState('');

    // UI states
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionSuccess, setSubmissionSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Cooldown logic
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const [lastSentTime, setLastSentTime] = useLocalStorage<number>('last_sales_request_sent', 0);
    const [now, setNow] = useState(Date.now());

    const toggleLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
    };

    const remainingTime = useMemo(() => {
        const diff = lastSentTime + COOLDOWN_MS - now;
        return diff > 0 ? diff : 0;
    }, [lastSentTime, now]);

    const formatRemainingTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (remainingTime > 0) {
            const timer = setInterval(() => setNow(Date.now()), 1000);
            return () => clearInterval(timer);
        }
    }, [remainingTime]);


    const cities = useMemo(() => {
        if (locationState) {
            return geoDataParsed.filter(item => item.state === locationState).map(item => ({
                value: item.city,
                label_en: toTitleCase(item.city),
                label_ar: item.city_ar,
            }));
        }
        return [];
    }, [locationState]);

    const handleCityChange = (cityVal: string) => {
        setLocationCity(cityVal);
    };

    const isArabic = i18n.language === 'ar';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!enterpriseName.trim()) {
            setError(t('contact_sales.error.name_required'));
            return;
        }
        if (!locationState || !locationCity) {
            setError(t('contact_sales.error.location_required'));
            return;
        }
        if (!contactEmail.trim() || !EMAIL_REGEX.test(contactEmail)) {
            setError(t('contact_sales.error.email_invalid'));
            return;
        }
        if (!phoneNumber.trim() || !PHONE_REGEX.test(phoneNumber)) {
            setError(t('contact_sales.error.phone_invalid'));
            return;
        }

        if (remainingTime > 0) {
            toast.error(t('contact_sales.cooldown_active', {time: formatRemainingTime(remainingTime)}));
            return;
        }

        setIsSubmitting(true);
        try {
            const fullLocation = `${locationCity}, ${locationState}`;
            const payload = {
                enterprise_name: enterpriseName,
                location: fullLocation,
                email: contactEmail,
                phone: phoneNumber,
                meeting_preference: meetingPreference,
                body: message,
            };
            await api.post('/users/contact-sales', payload);
            setSubmissionSuccess(true);
            setLastSentTime(Date.now());
            setNow(Date.now()); // Reset now for immediate cooldown update
            toast.success(t('contact_sales.submit_success'));
        } catch (err: any) {
            console.error("Failed to submit sales request:", err);
            setError(err.response?.data?.error || t('contact_sales.submit_error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4" dir={i18n.dir()}>
            {/* Language Switcher - Absolute Top End Corner */}
            <div className="absolute top-6 end-6 flex items-center gap-3 bg-[var(--color-bg)] ps-3 pe-2 py-1.5 transition-all hover:border-primary/30 font-medium text-sm text-neutral/80">
            <Select value={i18n.language} onValueChange={toggleLanguage} dir={i18n.dir()}>
                <SelectTrigger className="flex items-center gap-4 relative z-10 bg-white">
                    <img src="/eva-icons/fill/png/128/globe-2.png" alt="Language" className="w-5 h-5 opacity-70"
                    onError={(e) => {e.currentTarget.style.backgroundColor='#ccc'; e.currentTarget.style.borderRadius='50%'}}/>
                    <SelectValue placeholder={i18n.language} />
                </SelectTrigger>
                <SelectContent className='bg-white'>
                    <SelectGroup>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                    </SelectGroup>
                </SelectContent>
            </Select>
            </div>
            <Card className="max-w-md w-full p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl" dir={i18n.dir()}>
                <ScrollArea className="max-h-[90vh]" dir={i18n.dir()}>
                    <div className="p-6 pb-2 flex items-center justify-between">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-8 w-8"
                            onClick={() => navigate(-1)}
                        >
                            {i18n.dir() === 'ltr' ? <ArrowLeft className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4 rotate-180" />}
                        </Button>
                        <h1 className="text-2xl font-black text-center flex-grow">
                            {t('contact_sales.title', 'Contact Sales')}
                        </h1>
                        <div className="w-8"></div> {/* Spacer for symmetry */}
                    </div>

                    <AnimatePresence mode="wait">
                        {submissionSuccess ? (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="p-6 pt-0 space-y-8 text-center"
                            >
                                <div className="flex justify-center mt-8">
                                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                </div>
                                <h2 className="text-xl font-bold text-neutral">{t('contact_sales.success_header')}</h2>
                                <p className="text-neutral/60">{t('contact_sales.success_message')}</p>
                                <Button onClick={() => navigate('/registration')} className="w-full h-12 rounded-xl text-lg font-bold">
                                    {t('contact_sales.back_to_registration')}
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.form
                                key="form"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                onSubmit={handleSubmit}
                                className="p-6 pt-0 space-y-6"
                            >
                                <p className="text-neutral/60 text-center mb-6">{t('contact_sales.description')}</p>

                                {error && (
                                    <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200">
                                        <AlertCircle className="h-4 w-4 text-red-600" />
                                        <AlertTitle className="text-red-800">{t('common.error')}</AlertTitle>
                                        <AlertDescription className="text-red-700">{error}</AlertDescription>
                                    </Alert>
                                )}

                                {/* Enterprise Name */}
                                <div className="space-y-2">
                                    <Label htmlFor="enterpriseName" className="text-primary ps-1 font-semibold">{t('contact_sales.label.enterprise_name')}</Label>
                                    <div className="relative">
                                        <Building className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                        <Input
                                            id="enterpriseName"
                                            type="text"
                                            value={enterpriseName}
                                            onChange={(e) => setEnterpriseName(e.target.value)}
                                            placeholder={t('contact_sales.placeholder.enterprise_name')}
                                            required
                                            className="ps-10 h-12 rounded-xl border-neutral/20 focus:ring-primary/20 bg-gray-50"
                                        />
                                    </div>
                                </div>

                                {/* HQ Location */}
                                <div className="space-y-2">
                                    <Label className="ps-1 font-semibold text-primary">{t('contact_sales.label.hq_location')}</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* State */}
                                        <SearchableSelect
                                            items={uniqueStates.map(s => ({ value: s.value, label: isArabic ? s.label_ar : s.label_en }))}
                                            value={locationState}
                                            onValueChange={(val: string) => {
                                                setLocationState(val);
                                                setLocationCity(''); // Reset city when state changes
                                            }}
                                            placeholder={t('contact_sales.placeholder.select_state')}
                                        />
                                        {/* City */}
                                        <SearchableSelect
                                            items={cities.map(c => ({ value: c.value, label: isArabic ? c.label_ar : c.label_en }))}
                                            value={locationCity}
                                            onValueChange={handleCityChange}
                                            placeholder={t('contact_sales.placeholder.select_city')}
                                            disabled={!locationState}
                                        />
                                    </div>
                                </div>

                                {/* Contact Email */}
                                <div className="space-y-2">
                                    <Label htmlFor="contactEmail" className="ps-1 font-semibold text-primary">{t('contact_sales.label.contact_email')}</Label>
                                    <div className="relative">
                                        <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                        <Input
                                            id="contactEmail"
                                            type="email"
                                            value={contactEmail}
                                            onChange={(e) => setContactEmail(e.target.value)}
                                            placeholder={t('contact_sales.placeholder.contact_email')}
                                            required
                                            className="ps-10 h-12 rounded-xl border-neutral/20 focus:ring-primary/20 bg-gray-50"
                                        />
                                    </div>
                                    {!EMAIL_REGEX.test(contactEmail) && contactEmail.length > 0 && (
                                        <p className="text-xs text-red-500 mt-1 ps-1">{t('contact_sales.error.email_invalid')}</p>
                                    )}
                                </div>

                                {/* Phone Number */}
                                <div className="space-y-2">
                                    <Label htmlFor="phoneNumber" className="ps-1 font-semibold text-primary">{t('contact_sales.label.phone_number')}</Label>
                                    <div className="relative">
                                        <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                        <Input
                                            id="phoneNumber"
                                            type="tel"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder={t('contact_sales.placeholder.phone_number')}
                                            required
                                            className="ps-10 h-12 rounded-xl border-neutral/20 focus:ring-primary/20 bg-gray-50"
                                        />
                                    </div>
                                    {!PHONE_REGEX.test(phoneNumber) && phoneNumber.length > 0 && (
                                        <p className="text-xs text-red-500 mt-1 ps-1">{t('contact_sales.error.phone_invalid')}</p>
                                    )}
                                </div>

                                {/* Meeting Preference */}
                                <div className="space-y-2">
                                    <Label htmlFor="meetingPreference" className="ps-1 font-semibold text-primary">{t('contact_sales.label.meeting_preference')}</Label>
                                    <div className="relative">
                                        <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                        <Select value={meetingPreference} onValueChange={setMeetingPreference} dir={i18n.dir()}>
                                            <SelectTrigger className="ps-10 h-12 rounded-xl border-neutral/20 focus:ring-primary/20 bg-gray-50">
                                                <SelectValue placeholder={t('contact_sales.placeholder.meeting_preference')} />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white rounded-xl">
                                                <SelectGroup>
                                                    <SelectItem value="message_only">{t('contact_sales.meeting_options.message_only')}</SelectItem>
                                                    <SelectItem value="call">{t('contact_sales.meeting_options.call')}</SelectItem>
                                                    <SelectItem value="online_meeting">{t('contact_sales.meeting_options.online_meeting')}</SelectItem>
                                                    <SelectItem value="on_site_visit">{t('contact_sales.meeting_options.on_site_visit')}</SelectItem>
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Message */}
                                <div className="space-y-2">
                                    <Label htmlFor="message" className="ps-1 font-semibold text-primary">{t('contact_sales.label.message')}</Label>
                                    <div className="relative">
                                        <MessageCircle className="absolute start-3 top-2 w-5 h-5 text-neutral/30" />
                                        <Textarea
                                            id="message"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder={t('contact_sales.placeholder.message')}
                                            className="ps-10 min-h-[120px] resize-none rounded-xl border-neutral/20 focus:ring-primary/20 bg-gray-50"
                                        />
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 rounded-xl text-lg font-bold mt-4"
                                    disabled={isSubmitting || remainingTime > 0 || enterpriseName === '' || contactEmail === '' || phoneNumber === '' || locationCity === '' || meetingPreference === ''}
                                >
                                    {isSubmitting ? <Spinner /> : (remainingTime > 0 ? `${t('contact_sales.wait')} ${formatRemainingTime(remainingTime)}` : t('contact_sales.submit_button'))}
                                </Button>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </ScrollArea>
            </Card>
        </div>
    );
};

export default ContactSales;


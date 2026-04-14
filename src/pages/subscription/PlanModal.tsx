import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { AlertCircle, ArrowLeft, Check, Info, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useUserStore } from '@/store/useUserStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import { useSubscriptionPaymentStore } from '@/store/useSubscriptionPaymentStore';
import { supabase } from '@/lib/supabaseClient';
import api from '@/api/client';
import toast from 'react-hot-toast';

interface PlanModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

type PricingInfo = {
    plan_id: string;
    plan_type: 'Standard' | 'Enterprise';
    billing_cycle: 'Monthly' | 'Annual' | 'Lifetime';
    base_price: number;
    price_per_extra_employee: number;
    min_employees: number | null;
    max_employees: number | null;
    discount_rate: number | null;
};

export function PlanModal({ isOpen, onOpenChange }: PlanModalProps) {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const { subscriptions, currentSubscription, fetchSubscriptions } = useSubscriptionStore();
    const { subscriptionPayments, createSubscriptionPayment, fetchSubscriptionPayments } = useSubscriptionPaymentStore();

    const [view, setView] = useState<'status' | 'upgrade' | 'payment' | 'activate'>('status');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pricingData, setPricingData] = useState<PricingInfo[]>([]);
    const [isLoadingPricing, setIsLoadingPricing] = useState(false);
    const [bankDetails, setBankDetails] = useState<any>(null);

    // Upgrade/Renewal state
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [employees, setEmployees] = useState(1);
    const [tier1Duration, setTier1Duration] = useState<'Monthly' | 'Annual' | 'Lifetime'>('Monthly');

    // Payment state
    const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
    const [confirmedTransfer, setConfirmedTransfer] = useState<string | null>(null);
    const [referralCode, setReferralCode] = useState('');
    const [referralStatus, setReferralStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
    const [discountApplied, setDiscountApplied] = useState(false);
    const [discountPercent, setDiscountPercent] = useState<number | null>(null);
    const [distributorId, setDistributorId] = useState<string | null>(null);
    const [referenceNumber, setReferenceNumber] = useState('');
    const [receipt, setReceipt] = useState<string | null>(null);
    const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

    // License activation state
    const [licenseCode, setLicenseCode] = useState('');
    const [isActivating, setIsActivating] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchDistributorInfo = async () => {
            if (currentUser?.distributor_id && !discountApplied) {
                try {
                    const response = await api.post('/users/distributor-info', { distributor_id: currentUser.distributor_id });
                    if (response.data.distributorId) {
                        setDiscountApplied(true);
                        setDistributorId(response.data.distributorId);
                        setDiscountPercent(response.data.discountPercent);
                        setReferralStatus('valid');
                    }
                } catch (error) {
                    console.error("Failed to load distributor info:", error);
                }
            }
        };
        if (isOpen) {
            fetchDistributorInfo();
        }
    }, [isOpen, currentUser?.distributor_id]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchSubscriptions(currentUser?.uuid); // Fetch subscriptions for the current user
            fetchSubscriptionPayments();
            const status = currentUser?.status;
            if (status === 'grace' || status === 'expired' || status === 'trial') {
                setView('upgrade');
            } else {
                setView('status');
            }
        }
    }, [isOpen, currentUser?.status]);

    useEffect(() => {
        if (view === 'upgrade' && pricingData.length === 0) {
            fetchPricing();
        }
        if (view === 'payment' && !bankDetails) {
            fetchBankDetails();
        }
    }, [view]);

    const fetchPricing = async () => {
        setIsLoadingPricing(true);
        try {
            const { data, error } = await supabase.from('detailed_pricing').select('*');
            if (error) throw error;
            setPricingData((data as PricingInfo[]) || []);
        } catch (error) {
            console.error("Failed to fetch pricing:", error);
        } finally {
            setIsLoadingPricing(false);
        }
    };

    const fetchBankDetails = async () => {
        try {
            const response = await api.get('/users/bank-accounts');
            setBankDetails(response.data);
        } catch (error) {
            console.error("Failed to load bank details:", error);
        }
    };

    const triggerSync = async () => {
        setIsSyncing(true);
        try {
            await fetchSubscriptions(currentUser?.uuid);
            await fetchSubscriptionPayments();
        } catch (e) {
            console.error("Sync failed:", e);
        } finally {
            setIsSyncing(false);
        }
    };

    const latestSubscription = useMemo(() => {
        if (!subscriptions || subscriptions.length === 0) return null;
        // Sort subscriptions by creation date descending to get the latest
        const sortedSubscriptions = [...subscriptions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return sortedSubscriptions[0];
    }, [subscriptions]);

    const hasPendingPayment = useMemo(() => {
        if (!latestSubscription) return false;
        return subscriptionPayments.some(p => p.status === 'under_processing' && p.subscription_uuid === latestSubscription.uuid);
    }, [subscriptionPayments, latestSubscription]);

    const calculatedPrice = useMemo(() => {
        if (!selectedPlan || selectedPlan === 'Free Trial') return 0;

        let total = 0;
        const accountType = currentUser?.account_type || 'standard';

        if (accountType === 'standard') {
            const planInfo = pricingData.find(p =>
                p.plan_type.toLowerCase() === 'standard' && p.billing_cycle.toLowerCase() === selectedPlan.toLowerCase()
            );
            total = planInfo?.base_price || 0;
        } else if (accountType.startsWith('enterprise')) {
             const planInfo = pricingData.find(p =>
                p.plan_type.toLowerCase() === 'enterprise' && p.billing_cycle.toLowerCase() === tier1Duration.toLowerCase()
            );

            if (planInfo) {
                const basePrice = planInfo.base_price;
                const extraEmployeeCost = (employees > 1) ? (employees - 1) * planInfo.price_per_extra_employee : 0;
                const totalBeforeDiscount = basePrice + extraEmployeeCost;

                const discountInfo = pricingData.find(p =>
                    p.plan_type.toLowerCase() === 'enterprise' &&
                    p.min_employees && p.max_employees &&
                    employees >= p.min_employees && employees <= p.max_employees
                );

                const discountRate = discountInfo?.discount_rate || 0;
                total = totalBeforeDiscount * (1 - discountRate);
            }
        }

        if (discountApplied && discountPercent) {
            total = total * (1 - discountPercent / 100);
        }

        return Math.round(total);
    }, [selectedPlan, tier1Duration, employees, pricingData, currentUser?.account_type, discountApplied, discountPercent]);

    const handleApplyReferral = async () => {
        if (!referralCode) return;
        setReferralStatus('checking');
        try {
            const response = await api.post('/users/check-referral', { referral_code: referralCode });
            if (response.data.isValid) {
                setReferralStatus('valid');
                setDiscountApplied(true);
                setDistributorId(response.data.distributorId);
                setDiscountPercent(response.data.discountPercent);
            } else {
                setReferralStatus('invalid');
                setDiscountApplied(false);
            }
        } catch (error) {
            setReferralStatus('invalid');
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setReceiptPreview(URL.createObjectURL(file));
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => setReceipt(reader.result as string);
        }
    };

    const handleSubmitPayment = async () => {
        if (!isOnline) {
            toast.error(t('common.internet_required', 'Internet connection required'));
            return;
        }
        setIsSubmittingPayment(true);
        try {
            // 1. Create a new subscription first
            const subscriptionCreationData = {
                user_uuid: currentUser!.uuid,
                plan_type: selectedPlan === 'Tier1' ? 'enterprise' : selectedPlan!.toLowerCase(),
                billing_cycle: tier1Duration,
                employees: employees
            };
            const subscriptionResponse = await api.post('/subscriptions/create-and-sync', subscriptionCreationData);
            const newSubscriptionUuid = subscriptionResponse.data.new_subscription_uuid;

            if (!newSubscriptionUuid) {
                throw new Error(t('subscription.failed_create_sub', 'Failed to create new subscription.'));
            }

            // 2. Create the payment for the new subscription
            const paymentData = {
                subscription_uuid: newSubscriptionUuid,
                amount: calculatedPrice,
                payment_method: paymentMethod!,
                trx_no: referenceNumber,
                trx_screenshot: receipt,
                status: 'under_processing' as const,
                distributor_id: distributorId
            };

            const response = await createSubscriptionPayment(paymentData as any);

            if (!response) throw new Error(t('subscription.payment_failed', 'Failed to submit payment'));

            toast.success(t('subscription.payment_submitted', 'Payment submitted for review'));
            await triggerSync();
            onOpenChange(false);
        } catch (error: any) {
            toast.error(error.message || t('subscription.payment_failed', 'Failed to submit payment'));
        } finally {
            setIsSubmittingPayment(false);
        }
    };

    const handleActivateLicense = async () => {
        if (!isOnline) {
            toast.error(t('common.internet_required', 'Internet connection required'));
            return;
        }
        setIsActivating(true);
        try {
            // Call Python backend proxy for license activation
            const response = await api.post('/subscriptions/activate', {
                p_license_code: licenseCode,
                p_user_uuid: currentUser?.uuid
            });

            if (response.data.error) throw new Error(response.data.error);

            if (response.data.success) {
                toast.success(t('subscription.activation_success', 'License activated successfully!'));
                await triggerSync();
                setView('status');
            } else {
                throw new Error(response.data.message || t('subscription.activation_failed', 'Invalid license code'));
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsActivating(false);
        }
    };
    const renderStatus = () => {
        const isTampered = currentSubscription?.tampered;
        const isGrace = currentUser?.status === 'grace';
        const isExpired = currentUser?.status === 'expired';
        const isAdmin = currentUser?.role === 'admin';
        const isEmployee = currentUser?.role === 'employee';

        if (isTampered) {
            return (
                <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
                    <ShieldAlert className="w-16 h-16 text-red-600 animate-pulse" />
                    <h2 className="text-2xl font-black text-red-600 uppercase tracking-tighter">Security Alert</h2>
                    <p className="text-neutral/70 font-bold">
                        {t('subscription.tampered_desc', 'Unusual activity detected on your account. Access to online features has been restricted for security reasons.')}
                    </p>
                    <Button variant="destructive" className="w-full h-12 text-lg font-bold" onClick={() => onOpenChange(false)}>
                        {t('subscription.contact_support', 'Contact Support')}
                    </Button>
                </div>
            );
        }

        if (isEmployee) {
            return (
                <div className="flex flex-col items-center justify-center p-8 space-y-6 text-center">
                    <div className="bg-primary/10 p-4 rounded-full">
                        <ShieldAlert className="w-12 h-12 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold mb-2">{t('subscription.org_subscribed', 'Organization Subscription')}</h3>
                        <p className="text-neutral/60">
                            {t('subscription.org_member_desc', 'You are part of the {{org}} organization.', { org: currentUser?.org_name })}
                        </p>
                    </div>
                    {(isGrace || isExpired) && (
                        <Alert variant="destructive" className="bg-red-50 border-red-200">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t('subscription.action_required', 'Action Required')}</AlertTitle>
                            <AlertDescription>
                                {t('subscription.contact_admin_renew', 'Your organization\'s plan has expired. Please contact your administrator to renew.')}
                            </AlertDescription>
                        </Alert>
                    )}
                    <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>{t('common.close', 'Close')}</Button>
                </div>
            );
        }

        return (
            <div className="space-y-6 p-4">
                <div className="flex flex-col items-center gap-2 pb-4 border-b">
                     <span className="text-xs font-bold text-neutral/40">{t('subscription.current_plan', 'Current Plan')}</span>
                     <h2 className="text-3xl font-black text-primary capitalize">{currentSubscription?.type || 'N/A'}</h2>
                     <div className={cn(
                         "px-3 py-1 rounded-full text-xs font-black uppercase tracking-tighter",
                         (isGrace) ? "bg-yellow-100 text-yellow-700" : isExpired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                     )}>
                         {isGrace ? t('dashboard.grace', 'Grace Period') : isExpired ? t('dashboard.expired', 'Expired') : t('dashboard.active', 'Active')}
                     </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-bold text-neutral/40 block mb-1">{t('subscription.expires_on', 'Expires On')}</span>
                        <span className="text-sm text-primary font-bold">{currentSubscription?.expiration_date ? new Date(currentSubscription.expiration_date).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <span className="text-[10px] font-bold text-neutral/40 block mb-1">{t('subscription.account_type', 'Account Type')}</span>
                        <span className="text-sm text-primary font-bold capitalize">{currentUser?.account_type?.replace('_', ' ')}</span>
                    </div>
                </div>

                {currentSubscription?.license_code && (
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 text-center">
                        <span className="text-[10px] font-bold text-primary/60 uppercase block mb-2">{t('subscription.your_license', 'Your License Code')}</span>
                        <code className="text-lg font-mono font-bold select-all tracking-wider">{currentSubscription.license_code}</code>
                    </div>
                )}

                <div className="flex flex-col gap-2 pt-4">
                    {(isGrace || isExpired) && isAdmin && (
                        <Button className="h-12 text-lg font-bold text-white" onClick={() => setView('upgrade')}>
                            {t('subscription.renew_now', 'Renew Subscription')}
                        </Button>
                    )}
                    {!isExpired && !isGrace && isAdmin && (
                         <Button variant="outline" className="h-12 text-lg font-bold" onClick={() => setView('upgrade')}>
                            {t('subscription.upgrade_plan', 'Upgrade Plan')}
                        </Button>
                    )}
                    {/* <Button variant="ghost" className="font-bold text-neutral/50" onClick={() => setView('activate')}>
                        {t('subscription.have_code', 'Have a license code?')}
                    </Button> */}
                    <Button variant="link" className="text-xs opacity-50" onClick={triggerSync} disabled={isSyncing}>
                        {isSyncing ? <Spinner className="w-3 h-3 me-2" /> : null}
                        {t('subscription.refresh_status', 'Refresh Status')}
                    </Button>
                </div>
            </div>
        );
    };

    const renderUpgrade = () => {
        const isEnterprise = currentUser?.account_type?.startsWith('enterprise');
        const currentType = currentSubscription?.type;
        const isActive = currentUser?.status === 'active';

        // Filter plans: If active, don't show the current plan (prevent early renew)
        // If expired/grace, show everything.
        let plans = isEnterprise ? ['Tier1'] : ['Monthly', 'Annual', 'Lifetime'];

        if (isActive && currentType) {
            plans = plans.filter(p => p.toLowerCase() !== currentType.toLowerCase());
        }

        return (
            <div className="space-y-6">
                {!hasPendingPayment && (<div className="flex flex-col text-center items-center gap-4 mb-4">
                    <label className="font-bold w-full">{t('subscription.choose_plan', 'Choose your new plan')}</label>
                </div>)}

                {isLoadingPricing ? (
                    <div className="py-20 flex justify-center"><Spinner className="w-12 h-12" /></div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        { !hasPendingPayment && plans.map((plan) => (
                            <Card key={plan}
                                className={cn(
                                    "cursor-pointer transition-all border-[0.5px]  hover:border-primary",
                                    selectedPlan === plan ? " border-primary bg-primary/5" : "border-gray-200"
                                )}
                                onClick={() => setSelectedPlan(plan)}
                            >
                                <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                                    <div>
                                        <CardTitle className="text-lg font-black">{t(`registration.plans.${plan.toLowerCase()}`, plan)}</CardTitle>
                                        <CardDescription className="text-xs">
                                            {isEnterprise ? t('registration.plans.tier1_desc', 'Flexible for small to medium teams') : ''}
                                        </CardDescription>
                                    </div>
                                    <div className="text-right">
                                         <div className="font-black text-primary text-xl">
                                             {pricingData.length > 0 ? (
                                                 plan === 'Tier1' ?
                                                 formatCurrency(calculatedPrice) :
                                                 formatCurrency(pricingData.find(p => p.billing_cycle.toLowerCase() === plan.toLowerCase() && p.plan_type.toLowerCase() === 'standard')?.base_price )
                                             ) : '...'}
                                         </div>
                                    </div>
                                </CardHeader>
                                {plan === 'Tier1' && selectedPlan === 'Tier1' && (
                                    <CardContent className="p-4 pt-0 space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">{t('registration.employees_count', 'Employees')}: {employees}</Label>
                                            <Slider value={[employees]} max={50} min={1} step={1} onValueChange={(v) => setEmployees(v[0])} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold">{t('registration.duration', 'Duration')}</Label>
                                            <Select value={tier1Duration} onValueChange={(v: any) => setTier1Duration(v)}>
                                                <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                                <SelectContent className="bg-white">
                                                    <SelectItem value="Monthly">{t('registration.plans.monthly', 'Monthly')}</SelectItem>
                                                    <SelectItem value="Annual">{t('registration.plans.annual', 'Annual')}</SelectItem>
                                                    <SelectItem value="Lifetime">{t('registration.plans.lifetime', 'Lifetime')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        ))}

                    {
                        !hasPendingPayment && (
                            <span className='text-center font-semibold'>{t('subscription.current_plan', 'Your current plan is:')} {t(`registration.plans.${currentType}`, `${currentType}`)}</span>
                        )
                    }

                    </div>
                )}

                {hasPendingPayment && (
                    <Alert className="bg-blue-50 border-blue-200">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-blue-800 font-bold">{t('subscription.payment_pending', 'Payment Under Review')}</AlertTitle>
                        <AlertDescription className="text-blue-700">
                            {t('subscription.pending_desc', 'You already have a payment pending review. Please wait for the administrator to approve it.')}
                        </AlertDescription>
                    </Alert>
                )}

                {!discountApplied && !hasPendingPayment && (
                    <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                        <Label className="text-xs font-bold ps-1">{t('registration.referral_code', 'Referral Code (Optional)')}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={referralCode}
                                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                                placeholder="SSC-XXXX"
                                className="h-10 font-bold uppercase"
                                disabled={referralStatus === 'checking' || referralStatus === 'valid'}
                            />
                            <Button
                                variant="outline"
                                onClick={handleApplyReferral}
                                disabled={!referralCode || referralStatus === 'checking' || referralStatus === 'valid'}
                            >
                                {referralStatus === 'checking' ? <Spinner className="w-4 h-4" /> : t('common.apply', 'Apply')}
                            </Button>
                        </div>
                        {referralStatus === 'valid' && <p className="text-[10px] text-green-600 font-bold ps-1">{t('registration.referral_valid', 'Discount Applied!')}</p>}
                        {referralStatus === 'invalid' && <p className="text-[10px] text-red-600 font-bold ps-1">{t('registration.referral_invalid', 'Invalid referral code')}</p>}
                    </div>
                )}

                {discountApplied && !hasPendingPayment && (
                    <Alert className="bg-green-50 border-green-200">
                        <Check className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-green-800 font-bold">{t('subscription.discount_active', 'Discount Active')}</AlertTitle>
                        <AlertDescription className="text-green-700">
                            {t('subscription.discount_desc', 'A {{percent}}% discount has been applied to your total.', { percent: discountPercent })}
                        </AlertDescription>
                    </Alert>
                )}

                {
                    !hasPendingPayment && (
                        <Button
                            className="w-full h-12 text-lg font-bold text-white mt-4"
                            disabled={!selectedPlan || hasPendingPayment}
                            onClick={() => setView('payment')}
                        >
                            {t('common.continue', 'Continue to Payment')}
                        </Button>
                    )
                }
            </div>
        );
    };

    const renderPayment = () => {
        return (
            <div className="space-y-6">
                <div className="flex items-center align-middle mb-4">
                    <Button variant="ghost" size="icon" onClick={() => setView('upgrade')}>
                        <ArrowLeft className={`${i18n.dir() === 'ltr' ? '' : 'rotate-180'}`} />
                    </Button>
                    <h2 className="text-xl font-bold">{t('registration.stage6.title', 'Payment Options')}</h2>
                </div>

                <div className="text-center p-6 bg-primary/5 rounded-2xl border border-primary/10">
                     <span className="text-xs font-bold text-primary/60 uppercase block mb-1">{t('registration.amount_to_pay', 'Amount to Pay')}</span>
                     <div className="text-4xl font-black text-primary">
                        {formatCurrency(calculatedPrice)}
                     </div>
                </div>

                <Accordion type="single" collapsible className="w-full" onValueChange={setPaymentMethod} value={paymentMethod || ''}>
                    {['Bankak', 'Ocash', 'Fawry', 'MyCashi', 'BNMB'].map((method) => (
                        <AccordionItem key={method} value={method} className="border rounded-xl px-4 mb-2">
                            <AccordionTrigger onClick={() => setConfirmedTransfer(null)} className="hover:no-underline py-4">
                                <div className="flex items-center gap-4 w-full">
                                    <div className="w-10 h-10 rounded-lg overflow-hidden border">
                                        <img src={`/bank_icons/${method.toLowerCase()}.jpg`} className="w-full h-full object-cover" alt={method} />
                                    </div>
                                    <span className="font-bold">{t(`finances.methods.${method}`, `${method}`)}</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                                {bankDetails ? (
                                    <div className="flex flex-col items-center gap-6 pt-4 border-t">
                                        <div className="text-center space-y-1">
                                            <p className="text-xs font-bold text-neutral/40 uppercase">{t('registration.account_name', 'Account Name')}</p>
                                            <p className="text-lg font-black">{bankDetails[method.toLowerCase()]?.account_name}</p>
                                            <p className="text-xs font-bold text-neutral/40 uppercase mt-4">{t('registration.account_number', 'Account Number')}</p>
                                            <p className="text-2xl font-mono font-black text-primary tracking-widest">{bankDetails[method.toLowerCase()]?.account_number}</p>
                                        </div>
                                        {bankDetails[method.toLowerCase()]?.qr_code && (
                                            <img src={bankDetails[method.toLowerCase()].qr_code} className="w-48 h-48 rounded-xl border border-primary-gray shadow-xl" alt="QR" />
                                        )}
                                        <div className="flex items-center gap-2 pt-4 w-full justify-center">
                                           <Checkbox id={`confirm-${method}`} checked={confirmedTransfer === method} onCheckedChange={(checked) => {
                                               setConfirmedTransfer(checked ? method : null);
                                               if (checked) { // Clear reference number and receipt if a new method is checked
                                                   setReferenceNumber('');
                                                   setReceipt(null);
                                                   setReceiptPreview(null);
                                               }
                                           }} />
                                           <label htmlFor={`confirm-${method}`} className="text-sm font-bold cursor-pointer">{t('registration.transfer_confirm', 'I have transferred the amount')}</label>
                                        </div>                                    </div>
                                ) : <div className="py-8 flex justify-center"><Spinner /></div>}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>

                {confirmedTransfer && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold ps-1">{t('registration.ref_number', 'Reference Number')}</Label>
                            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="e.g. REF-123456" className="h-12 font-bold" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold ps-1">{t('registration.upload_receipt', 'Upload Receipt')}</Label>
                            <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer bg-gray-50 hover:bg-gray-100 transition-all relative"
                                onClick={() => fileInputRef.current?.click()} >
                                {receiptPreview ? (
                                    <img src={receiptPreview} className="h-40 object-contain rounded-lg" alt="Receipt" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 opacity-40">
                                        <Check className="w-8 h-8" />
                                        <span className="text-sm font-bold">{t('registration.click_upload_receipt', 'Click to upload screenshot')}</span>
                                    </div>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            </div>
                        </div>
                    </div>
                )}

                <Button
                    className="w-full h-14 text-xl font-black text-white"
                    disabled={!paymentMethod || confirmedTransfer === null || !referenceNumber || isSubmittingPayment}
                    onClick={handleSubmitPayment}
                >
                    {isSubmittingPayment ? <Spinner className="w-6 h-6" /> : t('registration.finish', 'Submit Payment')}
                </Button>
            </div>
        );
    };

    const renderActivate = () => {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4 mb-4">
                    <Button variant="ghost" size="icon" onClick={() => setView('status')}>
                        <Check className="rotate-180" />
                    </Button>
                    <h2 className="text-xl font-bold">{t('subscription.activate_license', 'Activate License')}</h2>
                </div>

                <div className="p-8 bg-primary/5 rounded-3xl border border-primary/10 flex flex-col items-center text-center space-y-4">
                    <div className="bg-primary/10 p-4 rounded-full">
                        <Check className="w-12 h-12 text-primary" />
                    </div>
                    <p className="text-sm font-bold text-neutral/60">
                        {t('subscription.activate_desc', 'Enter the license code sent to your email after payment approval.')}
                    </p>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-neutral/40 ps-1">{t('subscription.license_code', 'License Code')}</Label>
                    <Input
                        value={licenseCode}
                        onChange={(e) => setLicenseCode(e.target.value)}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        className="h-14 text-center font-mono text-xl font-black tracking-widest uppercase"
                    />
                </div>

                <div className="flex flex-col gap-2 pt-4">
                    <Button
                        className="h-14 text-xl font-black text-white"
                        onClick={handleActivateLicense}
                        disabled={licenseCode.length < 8 || isActivating}
                    >
                        {isActivating ? <Spinner className="w-6 h-6" /> : t('subscription.activate_now', 'Activate Now')}
                    </Button>
                    {!isOnline && (
                        <div className="flex items-center justify-center gap-2 text-red-600 text-sm font-bold">
                            <WifiOff className="w-4 h-4" />
                            <span>{t('subscription.internet_required_activate', 'Internet connection required for activation')}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className=''>{t('subscription.modal_title', 'Subscription')}</DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[85vh] p-6 pt-0">
                    <div className="pb-6">
                        {view === 'status' && renderStatus()}
                        {view === 'upgrade' && renderUpgrade()}
                        {view === 'payment' && renderPayment()}
                        {view === 'activate' && renderActivate()}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}

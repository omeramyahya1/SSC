import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Link, useNavigate } from 'react-router-dom';
import { Progress } from "@/components/ui/progress";
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
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
import { Check, ChevronsUpDown, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRegistrationStore, RegistrationState } from '@/store/useRegistrationStore';
import api from '@/api/client';

// Import CSV raw
import geoDataCsv from '@/assets/dataset/geo_data.csv?raw';

// --- Constants ---
const TOTAL_STAGES = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 6;

// --- Helper Functions & Utilities ---

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

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

const dummyAsyncCheck = async (_field: string, value: string): Promise<boolean> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Mock logic: fail if value contains "fail"
      if (value.toLowerCase().includes('fail')) resolve(false);
      else resolve(true);
    }, 1000); // 1s delay
  });
};

const areStage4FieldsFilled = (data: RegistrationState['stage4']) => {
  return data.businessName.trim() !== '' && data.locationState !== '' && data.locationCity !== '';
};

// --- Main Registration Component ---
export default function RegistrationScreen() {
  const { t, i18n } = useTranslation();
  
  const { formData, updateFormData, fetchSubscriptionConfig, reset, getPlanDetails } = useRegistrationStore();

  const [currentStage, setCurrentStage] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showInternetAlert, setShowInternetAlert] = useState(!navigator.onLine);
  const [showRestoredAlert, setShowRestoredAlert] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState<number | null>(null);

  // Fetch subscription config on mount
  useEffect(() => {
    fetchSubscriptionConfig();
    return () => {
        reset(); // Clean up on unmount
    }
  }, [fetchSubscriptionConfig, reset]);

  // Update layout based on stage
  useEffect(() => {
    setIsExpanded(currentStage >= 3);
  }, [currentStage]);

  // Online status listener
  useEffect(() => {
    const handleOnline = () => {
        setIsOnline(true);
        setShowInternetAlert(false);
        setShowRestoredAlert(true);
        setTimeout(() => setShowRestoredAlert(false), 4000);
    };
    const handleOffline = () => {
        setIsOnline(false);
        setShowInternetAlert(true);
        setShowRestoredAlert(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async () => {
      setIsSubmitting(true);
      setSubmissionError(null);
      try {
          const { backendAccountType, backendPlanType, price } = getPlanDetails();

          // Construct a clean payload matching the backend DTO
          const payload = {
              stage1: formData.stage1,
              account_type: backendAccountType,
              plan_type: backendPlanType,
              amount: price,
              stage4: {
                  businessName: formData.stage4.businessName,
                  locationState: formData.stage4.locationState,
                  locationCity: formData.stage4.locationCity,
                  latitude: formData.stage4.latitude,
                  longitude: formData.stage4.longitude,
                  logo: formData.stage4.logo
              },
              stage6: formData.stage6,
              stage7: {
                  referenceNumber: formData.stage7.referenceNumber,
                  receipt: formData.stage7.receipt,
              }
          };

          const response = await api.post('/users/register', payload);
          setNewUserId(response.data.user_id);
          setCurrentStage(prev => prev + 1);
      } catch (error: any) {
          console.error("Registration failed:", error);
          const errorDetails = error.response?.data?.details;
          if (errorDetails) {
            const formattedError = errorDetails.map((d: any) => `${d.loc[1]}: ${d.msg}`).join('; ');
            setSubmissionError(formattedError);
          } else {
            setSubmissionError(error.response?.data?.error || t('registration.errors.unknown_error', "An unknown error occurred."));
          }
      } finally {
          setIsSubmitting(false);
      }
  }

  const handleNext = () => {
    if (currentStage === 7) { // Trigger submission from Stage 7
        handleSubmit();
        return;
    }

    if (currentStage < TOTAL_STAGES) {
      if (currentStage === 4) {
         if (!areStage4FieldsFilled(formData.stage4)) {
            updateFormData('stage4', { isSkipped: true });
         }
      }
      setCurrentStage(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStage > 1) {
      setCurrentStage(prev => prev - 1);
    }
  };

  const toggleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };
  
  const progressPercentage = (currentStage / TOTAL_STAGES) * 100;
  const [stepValid, setStepValid] = useState(false);
  useEffect(() => {
     setStepValid(false);
  }, [currentStage]);


  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[var(--color-bg)] overflow-hidden">
       {/* ... Internet alerts from previous implementation ... */}
       {showInternetAlert && !isOnline && (
            <div className="fixed top-0 inset-x-0 z-50 p-4 w-fit max-w-md mx-auto animate-in slide-in-from-top-16 duration-300">
                <Alert className="bg-yellow-100 border-yellow-500 text-yellow-900 shadow-sm rounded-base gap-2">
                <div className="relative flex flex-col items-center">
                    <button className="absolute start-2 top-2 font-bold opacity-70 hover:opacity-100" onClick={() => setShowInternetAlert(false)} aria-label={t('registration.close_alert', "Close alert")}>✕</button>
                    <img src="/eva-icons (2)/fill/alert-triangle.png" className="h-5 w-5 opacity-70 mb-1" alt={t('registration.warning_alt', 'Warning')}/>
                    <AlertTitle className="text-yellow-900 font-bold text-center">{t('registration.warning_title', 'Warning')}</AlertTitle>
                    <AlertDescription className="text-yellow-900 text-center">{t('registration.internet_required', 'Internet is required to continue the registration process.')}</AlertDescription>
                </div>
                </Alert>
            </div>
       )}
       {showRestoredAlert && isOnline && (
            <div className="fixed top-0 inset-x-0 z-50 p-4 w-fit max-w-md mx-auto animate-in slide-in-from-top-16 duration-300">
                <Alert className="bg-green-100 border-green-500 text-green-900 shadow-sm rounded-base gap-2">
                <div className="relative flex flex-col items-center">
                    <button className="absolute start-2 top-2 font-bold opacity-70 hover:opacity-100" onClick={() => setShowRestoredAlert(false)} aria-label={t('registration.close_alert', "Close alert")}>✕</button>
                    <img src="/eva-icons (2)/outline/checkmark-circle-2.png" className="h-5 w-5 opacity-70 mb-1 filter invert-[.35] sepia-[1] saturate-[3] hue-rotate-[90deg]" alt={t('registration.success_alt', 'Success')}/>
                    <AlertTitle className="text-green-900 font-bold text-center">{t('registration.internet_restored_title', 'Internet Restored')}</AlertTitle>
                    <AlertDescription className="text-green-900 text-center">{t('registration.internet_restored_desc','Your internet connection has been restored. You can now continue.')}</AlertDescription>
                </div>
                </Alert>
            </div>
       )}

      <div className={`w-full min-h-screen flex transition-all duration-500 ease-in-out ${isExpanded ? 'flex-row' : 'flex-col md:flex-row'}`}>
        <LeftPanel isVisible={!isExpanded} />
        
        <div className={`relative transition-all duration-500 ease-in-out bg-[var(--color-bg)] p-8 md:p-12 flex flex-col h-screen overflow-y-auto items-center justify-center ${isExpanded ? 'w-full' : 'w-full md:w-2/3'}`}>
          <header className="relative flex items-center justify-between w-full mb-8 h-9 flex-shrink-0">
            {currentStage > 1 && currentStage < 8 && (
              <button onClick={handleBack} className="h-full border shadow-sm rounded-base flex items-center px-2 gap-4 text-neutral/70 z-20 bg-white" >
                <img src="/eva-icons/fill/png/128/chevron-left.png" alt={t('registration.back_alt', 'Back')} className={`w-5 h-5 opacity-70 transition-transform duration-300 ${i18n.language === 'ar' ? 'rotate-180' : ''}`}  />
                <span>{t('registration.back', 'Back')}</span>
              </button>
            )}
            <div className="absolute top-6 end-0 ">
              <LanguageSelector selectedLang={i18n.language} onChangeLang={toggleLanguage} />
            </div>
          </header>

          <main className="flex-grow flex items-center justify-center w-full">
            <div key={currentStage} className="w-full max-w-2xl animate-in slide-in-from-right-16 duration-300 justify-center flex flex-col items-center px-0 mx-0">
               <StageController 
                 stage={currentStage} 
                 setStepValid={setStepValid}
                 userId={newUserId}
               />
            </div>
          </main>

          <footer className="relative pt-8 mt-auto w-full ">
            <div className="flex flex-col items-center justify-between">
              <div className="w-24"></div>

              {currentStage < 8 && (
                <div className="w-full max-w-xs mx-auto">
                  <Progress value={progressPercentage} className="h-3 bg-white border border-x-primary-gray shadow-md" />
                  <p className="text-center text-sm text-neutral/60 mt-2">
                    {currentStage} {t('registration.stage_progress', 'of')} {TOTAL_STAGES}
                  </p>
                </div>
              )}
                
              {submissionError && currentStage === 7 && (
                  <div className="text-red-500 text-sm mt-2 text-center flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {submissionError}
                  </div>
              )}

              <div className="w-24 flex justify-end absolute bottom-0 end-0">
                {currentStage < TOTAL_STAGES && formData.stage3.plan !== 'Tier2' && (
                  <Button 
                    onClick={handleNext} 
                    disabled={!stepValid || !isOnline || isSubmitting} 
                    variant={currentStage === 4 && !stepValid ? "secondary" : "default"} 
                    className={cn(
                        'text-white',
                        currentStage === 4 && !areStage4FieldsFilled(formData.stage4) && 'bg-gray-400 hover:bg-gray-500',
                        isSubmitting && 'cursor-not-allowed'
                    )}
                  >
                    {isSubmitting ? <Spinner /> : 
                        currentStage === 7 ? t('registration.finish', 'Finish') :
                        currentStage === 4 && !areStage4FieldsFilled(formData.stage4) 
                        ? t('registration.skip', 'Skip') 
                        : t('registration.next', 'Next')}
                  </Button>
                )}
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}


// --- Sub-components (Refactored to use Zustand store) ---

const LeftPanel = ({ isVisible }: { isVisible: boolean }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className={`bg-primary text-white flex-col justify-between relative overflow-hidden transition-all duration-500 ease-in-out rounded-3xl mt-5 mb-5 ${isVisible ? 'flex opacity-100 w-full md:w-1/3 ms-5 p-8' : 'opacity-0 w-0 ms-0 p-0'} hidden md:flex`}>
            <div className="flex items-center gap-4 relative z-10">
                <img src="/ssc.svg" alt={t('registration.logo_alt', "SSC Logo")} className="w-12 h-12 bg-white/30 p-2 rounded-base backdrop-blur-sm"/>
                <span className="text-3xl font-extrabold tracking-wider">SSC</span>
            </div>
            <div className="my-12 md:my-auto relative z-10">
                <h2 className="text-4xl font-bold mb-6 leading-tight text-white">{t('registration.banner.title', "Create your account")}</h2>
                <p className="text-white/80 text-base leading-relaxed max-w-sm">{t('registration.banner.subtitle', "Join us and manage your solar projects efficiently.")}</p>
            </div>
            <div className="flex items-center justify-between text-sm font-medium relative z-10 pt-6 border-t border-white/30">
                <button type="button" className="hover:text-primary-lighter transition-colors hover:underline" onClick={() => navigate("/")}>{t('registration.login_link', "Login")}</button>
                <button type="button" className="hover:text-primary-lighter transition-colors hover:underline" onClick={() => navigate("/help")}>{t('login.need_help', "Need Help?")}</button>
            </div>
        </div>
    );
};


const CommonHeader = ({ title, text }: { title: string, text: string }) => {
    const { t } = useTranslation();
    return (
      <div className="text-center md:text-start mb-8">
        <h1 className="text-3xl font-bold text-neutral text-center">{t(title, text)}</h1>
      </div>
    );
};

// --- STAGE 1: Basic Info ---
const Stage1 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t } = useTranslation();
    const { formData, updateFormData } = useRegistrationStore();
    const data = formData.stage1;
    
    // ... (rest of the logic is the same, just consumes data from store)
    const [checkingUser, setCheckingUser] = useState(false);
    const [checkingEmail, setCheckingEmail] = useState(false);
    const [userAvailable, setUserAvailable] = useState<boolean | null>(null);
    const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
        if (data.username.length >= 3) {
            setCheckingUser(true);
            const avail = await dummyAsyncCheck('username', data.username);
            setUserAvailable(avail);
            setCheckingUser(false);
        } else {
            setUserAvailable(null);
        }
        }, 500);
        return () => clearTimeout(timer);
    }, [data.username]);

    useEffect(() => {
        const timer = setTimeout(async () => {
        if (EMAIL_REGEX.test(data.email)) {
            setCheckingEmail(true);
            const avail = await dummyAsyncCheck('email', data.email);
            setEmailAvailable(avail);
            setCheckingEmail(false);
        } else {
            setEmailAvailable(null);
        }
        }, 500);
        return () => clearTimeout(timer);
    }, [data.email]);

    useEffect(() => {
        const isValid = 
        data.username.length >= 3 && userAvailable === true &&
        EMAIL_REGEX.test(data.email) && emailAvailable === true &&
        data.password.length >= PASSWORD_MIN_LENGTH && /\d/.test(data.password) &&
        data.password === data.confirmPassword;
        setValid(isValid);
    }, [data, userAvailable, emailAvailable, setValid]);

    const handleChange = (field: string, val: string) => {
        updateFormData('stage1', { [field]: val });
    };

    return (
        <div className="space-y-4 w-full mx-auto md:mx-0">
          <CommonHeader title='registration.stage1.title' text='Basic Info' />
          
          <div className="space-y-1.5">
            <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.username', 'Username')}</Label>
            <div className="relative">
              <Input value={data.username} onChange={(e) => handleChange('username', e.target.value)} placeholder={t('registration.username_ph', 'Enter username')}
                className={`w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40 ${userAvailable === false ? 'ring-red-500 ring-2' : 'focus:shadow-md focus:ring-2 focus:ring-primary/20'}`} />
              {checkingUser && <Spinner className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral/50" />}
            </div>
            {userAvailable === false && <p className="text-xs text-red-500 mt-1 ps-1">{t('registration.username_taken', 'Username taken')}</p>}
          </div>
    
          <div className="space-y-1.5">
            <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.email', 'Email')}</Label>
            <div className="relative">
              <Input type="email" value={data.email} onChange={(e) => handleChange('email', e.target.value)} placeholder={t('registration.email_ph', 'Enter email')}
                className={`w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40 ${emailAvailable === false ? 'ring-red-500 ring-2' : 'focus:shadow-md focus:ring-2 focus:ring-primary/20'}`} />
              {checkingEmail && <Spinner className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral/50" />}
            </div>
            {emailAvailable === false && <p className="text-xs text-red-500 mt-1 ps-1">{t('registration.email_taken', 'Email already registered')}</p>}
          </div>
    
          <div className="space-y-1.5">
            <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.password', 'Password')}</Label>
            <div className='relative'>
                <Input type={showPassword ? "text" : "password"} value={data.password} onChange={(e) => handleChange('password', e.target.value)}  placeholder="••••••••"
              className="w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base focus:shadow-md focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40" />
              <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                >
                   {/* Placeholders for local eye icons */}
                  {showPassword ? (
                     <img src="/eva-icons/fill/png/128/eye.png" alt="Hide" className="w-6 h-6 opacity-70" />
                  ) : (
                     <img src="/eva-icons/fill/png/128/eye-off.png" alt="Show" className="w-6 h-6 opacity-70" />
                  )}
                </button>
            </div>
            <p className="text-xs text-neutral/50 ps-1">{t('registration.password_hint', 'Min 6 chars, at least 1 number')}</p>
          </div>
    
          <div className="space-y-1.5">
            <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.confirm_password', 'Confirm Password')}</Label>
            <div className='relative'>
                <Input type={showPassword ? "text" : "password"} value={data.confirmPassword} onChange={(e) => handleChange('confirmPassword', e.target.value)} placeholder="••••••••"
              className="w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base focus:shadow-md focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40" />
               <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                >
                   {/* Placeholders for local eye icons */}
                  {showPassword ? (
                     <img src="/eva-icons/fill/png/128/eye.png" alt="Hide" className="w-6 h-6 opacity-70" />
                  ) : (
                     <img src="/eva-icons/fill/png/128/eye-off.png" alt="Show" className="w-6 h-6 opacity-70" />
                  )}
                </button>
            </div>
            {data.password && data.confirmPassword && data.password !== data.confirmPassword && (
              <p className="text-xs text-red-500 mt-1 ps-1">{t('registration.passwords_mismatch', 'Passwords do not match')}</p>
            )}
          </div>
        </div>
      );
};

// --- STAGE 2: Account Type ---
const Stage2 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t } = useTranslation();
    const { formData, updateFormData } = useRegistrationStore();
    const { accountType } = formData.stage2;

    const handleSelect = (type: 'Standard' | 'Enterprise') => {
        updateFormData('stage2', { accountType: type });
        setValid(true);
    };

    useEffect(() => {
        setValid(!!accountType);
    }, [accountType, setValid]);

    // ... Same JSX as before
    return (
        <div className="space-y-4 w-full mx-auto md:mx-0">
          <CommonHeader title='registration.stage2.title' text='Choose Account Type' />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {['Standard', 'Enterprise'].map((type) => (
              <Card key={type} className={`cursor-pointer transition-all hover:shadow-lg border-2  relative overflow-hidden ${accountType === type ? 'border-primary shadow-md' : 'border-primary-gray/1 hover:border-primary/50'}`}
                onClick={() => handleSelect(type as any)} >
                 <div className="absolute top-0 end-0 p-2">
                     <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${accountType === type ? 'bg-semantic-success border-semantic-success text-white' : 'border-neutral/30'}`}>
                        {accountType === type && <img src="/eva-icons (2)/outline/checkmark-circle-2.png" className="w-4 h-4 rounded-full invert brightness-0 filter " alt={t('registration.check_alt', "check")}/>}
                     </div>
                 </div>
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto bg-neutral/10 w-16 h-16 rounded-full flex items-center justify-center mb-1">
                     <img src={type === 'Standard' ? "/eva-icons (2)/fill/person.png" : "/eva-icons (2)/fill/briefcase.png"} className="w-8 h-8 opacity-60" alt={type} />
                  </div>
                  <CardTitle>{t(`registration.type.${type.toLowerCase()}`, type)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center text-sm text-neutral/70">
                     {type === 'Standard' ? 
                        t('registration.desc.standard', "For Engineers, Small/Single branch , Traders") : 
                        t('registration.desc.enterprise', "For Multi-branch businesses, Multi-user, Centralized Management")
                     }
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
};

// --- STAGE 3: Plan Selection ---
const Stage3 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t } = useTranslation();
    const { formData, updateFormData, calculatedPrice } = useRegistrationStore();
    const { accountType } = formData.stage2;
    const data = formData.stage3;

    const handlePlanSelect = (plan: string) => {
        updateFormData('stage3', { plan });
        setValid(true);
    };
    
    useEffect(() => {
        setValid(!!data.plan);
    }, [data.plan, setValid]);

    const cardBaseClasses = "cursor-pointer rounded-xl transition-all hover:shadow-lg border-2 relative overflow-hidden";
    const selectedCardClasses = "border-primary shadow-md bg-white";
    const unselectedCardClasses = "border-primary-gray/1 hover:border-primary/50";

    const priceDisplay = calculatedPrice > 0 ? `${calculatedPrice.toLocaleString()} ${t('currency.sdg', 'SDG')}` : t('plans.free', '');

    // ... Refactored JSX to use calculatedPrice
    if (accountType === 'Enterprise') {
        return (
            <div className="space-y-4 w-full mx-auto md:mx-0">
                <CommonHeader title='registration.stage3.enterprise_title' text='Enterprise Plans' />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Tier 1 */}
                    <Card 
                      className={`${cardBaseClasses} ${data.plan === 'Tier1' ? selectedCardClasses : unselectedCardClasses}`}
                      onClick={() => handlePlanSelect('Tier1')}>
                        <CardHeader>
                            <CardTitle>{t('registration.plans.tier1', 'Tier 1')}</CardTitle>
                            <CardDescription>{t('registration.plans.tier1_desc', 'Flexible for small to medium teams')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label className="font-bold">{t('registration.employees_count', 'Number of Employees')}: {data.employees}</Label>
                                <Slider defaultValue={[data.employees]} max={20} min={1} step={1} onValueChange={(vals) => updateFormData('stage3', {employees: vals[0]})}
                                  onClick={(e) => { e.stopPropagation(); handlePlanSelect('Tier1'); }} />
                            </div>
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                <Label className="text-sm font-semibold">{t('registration.duration', 'Duration')}</Label>
                                <Select 
                                    value={data.tier1Duration} 
                                    onValueChange={(val: any) => updateFormData('stage3', {tier1Duration: val})}
                                    disabled={data.plan !== 'Tier1'}
                                >
                                    <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent className="bg-white">
                                        <SelectItem value="Monthly">{t('registration.plans.monthly', 'Monthly')}</SelectItem>
                                        <SelectItem value="Annual">{t('registration.plans.annual', 'Annual')}</SelectItem>
                                        <SelectItem value="Lifetime">{t('registration.plans.lifetime', 'Lifetime')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="text-2xl font-bold text-center">
                                {priceDisplay} <span className="text-sm font-normal text-neutral/50">{(data.tier1Duration === "Free Trial") ? "" : (data.tier1Duration === "Annual") ? "/year" : (data.tier1Duration === "Monthly") ? "/month" : ""}</span>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 mx-auto flex items-center justify-center ${data.plan === 'Tier1' ? 'bg-semantic-success border-semantic-success text-white' : 'border-neutral/30'}`}>
                               {data.plan === 'Tier1' && <Check className="w-4 h-4" />} 
                            </div>
                        </CardContent>
                    </Card>
  
                     {/* Tier 2 */}
                     <Card className={`${cardBaseClasses} ${data.plan === 'Tier2' ? selectedCardClasses : unselectedCardClasses}`}
                        onClick={() => handlePlanSelect('Tier2')}>
                        <CardHeader>
                            <CardTitle>{t('registration.plans.tier2', 'Tier 2')}</CardTitle>
                            <CardDescription>{t('registration.plans.tier2_desc', 'Unlimited Employees & Branches')}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-between h-full gap-6">
                             <div className="text-xl font-bold">{t('registration.custom_pricing', 'Custom Pricing')}</div>
                             <div className={`transition-opacity duration-300 ${data.plan === 'Tier2' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                  <Link to="/sales">
                                      <Button variant="outline" className='rounded-base'>{t('registration.contact_sales', 'Contact Sales')}</Button>
                                  </Link>
                             </div>
                             <div className={`w-6 h-6 rounded-full border-2 mx-auto flex items-center justify-center ${data.plan === 'Tier2' ? 'bg-semantic-success border-semantic-success text-white' : 'border-neutral/30'}`}>
                               {data.plan === 'Tier2' && <Check className="w-4 h-4" />} 
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        )
    }
  
    // Standard Plans
    const plans = ['Free Trial', 'Monthly', 'Annual', 'Lifetime'];
    return (
      <div className="max-w-4xl mx-auto">
        <CommonHeader title='registration.stage3.standard_title' text='Select a Plan' />
        <div className="flex flex-row gap-4">
          {plans.map((plan) => (
               <Card key={plan} className={`${cardBaseClasses} ${data.plan === plan ? selectedCardClasses : unselectedCardClasses}`}
                  onClick={() => handlePlanSelect(plan)}>
                    <CardHeader className="text-center">
                        <CardTitle className="text-lg">{t(`registration.plans.${plan.toLowerCase()}`, plan)}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <div className="text-2xl font-bold">
                            { (data.plan === plan) ? priceDisplay : ""}
                        </div>
                        <p className="text-xs text-neutral/60 h-8">
                            {t(`registration.plans.${plan.toLowerCase()}_desc`, '')}
                        </p>
                        <div className={`w-6 h-6 rounded-full border-2 mx-auto flex items-center justify-center ${data.plan === plan ? 'bg-semantic-success border-semantic-success text-white' : 'border-neutral/30'}`}>
                               {data.plan === plan && <Check className="w-4 h-4" />} 
                        </div>
                    </CardContent>
                </Card>
          ))}
        </div>
      </div>
    );
};


// --- STAGE 4: Business Info ---
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

const Stage4 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t, i18n } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { formData, updateFormData } = useRegistrationStore();
    const data = formData.stage4;
    const accountType = formData.stage2.accountType;

    const cities = useMemo(() => {
        if (data.locationState) {
            return geoDataParsed.filter(item => item.state === data.locationState).map(item => ({
                value: item.city,
                label_en: toTitleCase(item.city),
                label_ar: item.city_ar,
                latitude: item.latitude,
                longitude: item.longitude
            }));
        }
        return [];
    }, [data.locationState]);

    useEffect(() => {
        setValid(true); // Always skippable
    }, [setValid]);

    const handleCityChange = (cityVal: string) => {
        const cityObj = cities.find(c => c.value === cityVal);
        if (cityObj) {
            updateFormData('stage4', { locationCity: cityVal, latitude: cityObj.latitude, longitude: cityObj.longitude });
        } else {
            updateFormData('stage4', { locationCity: cityVal, latitude: '', longitude: '' });
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const preview = URL.createObjectURL(file);
            const base64 = await fileToBase64(file);
            updateFormData('stage4', { logo: base64, logoPreview: preview });
        }
    };

    const removeLogo = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateFormData('stage4', { logo: null, logoPreview: null });
    };

    // ... same JSX as before
    const isEnterprise = accountType === 'Enterprise';
    const isArabic = i18n.language === 'ar';
  
    return (
      <div className="space-y-4 w-full mx-auto md:mx-0">
        <CommonHeader title='' text={accountType === 'Enterprise' ? t('registration.org_info', 'Organization Info') : t('registration.business_info', 'Business Info')} />
        <p className="text-sm text-neutral/50 -mt-6 mb-6 ps-1">{t('registration.optional', '(Optional)')}</p>
  
        <div className="space-y-1.5">
          <Label className="block text-sm font-bold text-neutral/80 ps-1">
            {isEnterprise ? t('registration.org_name', 'Organization Name') : t('registration.business_name', 'Business Name')}
          </Label>
          <Input value={data.businessName} onChange={(e) => updateFormData('stage4', {businessName: e.target.value})}
              placeholder={t('registration.name_ph', 'Enter name')} className="w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base focus:shadow-md focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40" />
        </div>
  
        <div className="space-y-1.5">
           <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.state', 'State')}</Label>
           <SearchableSelect items={uniqueStates.map(s => ({ value: s.value, label: isArabic ? s.label_ar : s.label_en }))} value={data.locationState}
               onValueChange={(val) => updateFormData('stage4', {locationState: val, locationCity: '', latitude: '', longitude: ''})} placeholder={t('registration.select_state', 'Select state')} />
        </div>
  
         <div className="space-y-1.5">
           <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.city', 'City')}</Label>
           <SearchableSelect items={cities.map(c => ({ value: c.value, label: isArabic ? c.label_ar : c.label_en }))} value={data.locationCity}
               onValueChange={handleCityChange} placeholder={t('registration.select_city', 'Select city')} disabled={!data.locationState} />
        </div>
  
        <div className="space-y-1.5">
          <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.logo', 'Upload Logo')}</Label>
          <div className="border-2 bg-white border-dashed border-neutral/30 rounded-lg shadow-sm p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral/5 transition-colors relative"
              onClick={() => fileInputRef.current?.click()} >
              {data.logoPreview ? (
                  <>
                      <button onClick={removeLogo} className="absolute top-2 right-2 p-1 bg-neutral/10 rounded-full hover:bg-neutral/20">
                          <X className="w-4 h-4 text-neutral/70" />
                      </button>
                      <img src={data.logoPreview} alt={t('registration.logo_preview_alt', "Preview")} className="h-24 object-contain" />
                  </>
              ) : (
                  <>
                      <img src="/eva-icons (2)/fill/file-add.png" className="w-8 h-8 opacity-40 mb-2" alt={t('registration.upload_alt', "upload")} />
                      <span className="text-sm text-neutral/50">{t('registration.click_upload', 'Click to upload')}</span>
                  </>
              )}
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
          </div>
        </div>
      </div>
    );
};

// --- STAGE 5: Summary ---
const Stage5 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t } = useTranslation();
    const { formData, updateFormData, calculatedPrice } = useRegistrationStore();
    const { stage2, stage3, stage5 } = formData;
  
    useEffect(() => {
       setValid(stage5.acceptedTerms && stage5.acceptedProcessing);
    }, [stage5, setValid]);
  
    const toggleTerms = (checked: boolean) => updateFormData('stage5', { acceptedTerms: checked });
    const toggleProcessing = (checked: boolean) => updateFormData('stage5', { acceptedProcessing: checked });

    const priceDisplay = calculatedPrice > 0 ? `${calculatedPrice.toLocaleString()} ${t('currency.sdg', 'SDG')}` : t('plans.free', 'Free');
  
    // ... same as before but using calculatedPrice
    return (
        <div className="space-y-4 w-full mx-auto md:mx-0">
            <CommonHeader title='registration.stage5.title' text='Summary & Review' />
            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-neutral/60">{t('registration.account_type', 'Account Type')}</span>
                        <span className="font-semibold">{t(`registration.type.${stage2.accountType.toLowerCase()}`, stage2.accountType)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-neutral/60">{t('registration.plan', 'Plan')}</span>
                        <span className="font-semibold">
                            {t(`registration.plans.${stage3.plan.toLowerCase()}`, stage3.plan)} 
                            {stage3.plan === 'Tier1' && ` (${stage3.employees} ${t('registration.emp_short', 'emp')})`}
                        </span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-lg font-bold">{t('registration.total', 'Total')}</span>
                        <span className="text-xl font-bold text-primary">{priceDisplay}</span>
                    </div>
                </CardContent>
            </Card>
    
            <div className="space-y-4 pt-4 ps-5">
                 <div className="flex items-start space-x-2">
                    <Checkbox id="terms" checked={stage5.acceptedTerms} onCheckedChange={toggleTerms as any} />
                    <div className="grid gap-1.5 leading-none">
                        <label htmlFor="terms" className="text-sm font-medium leading-none cursor-pointer">{t('registration.accept_terms', 'I accept the Terms & Conditions')}</label>
                        <Dialog>
                            <DialogTrigger asChild>
                                <span className="text-xs text-primary cursor-pointer hover:underline">{t('registration.read_terms', 'Read Terms')}</span>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[80vh] bg-neutral-bg">
                                <DialogHeader>
                                    <DialogTitle>{t('registration.terms_title', 'Terms and Conditions')}</DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="h-full mt-4 border-2 p-4 rounded-base bg-neutral/5">
                                    <p className="text-sm text-neutral/70">
                                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
                                        {/* ... more dummy text ... */}
                                    </p>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
                <div className="flex items-start space-x-2">
                    <Checkbox id="processing" checked={stage5.acceptedProcessing} onCheckedChange={toggleProcessing as any} />
                     <label htmlFor="processing" className="text-sm font-medium leading-none cursor-pointer">{t('registration.accept_processing', 'I acknowledge the 24h processing time')}</label>
                </div>
            </div>
        </div>
      );
};

// ... STAGE 6, 7 are similar, just wiring to Zustand and using file-to-base64
const Stage6 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t } = useTranslation();
    const { formData, updateFormData, calculatedPrice } = useRegistrationStore();
    const data = formData.stage6;

    const [bankDetails, setBankDetails] = useState<any>(null);
  
    useEffect(() => {
       setValid(!!data.paymentMethod && !!data.confirmedTransfer);
    }, [data, setValid]);

    useEffect(() => {
        // Dummy async fetch
        setTimeout(() => setBankDetails({
            bankak: { accountNo: 123456, accountName: "SSC - Ltd" },
            ocash: { accountNo: 123456, accountName: "SSC - Ltd" },
            fawry: { accountNo: 123456, accountName: "SSC - Ltd" },
            mycashi: { accountNo: 123456, accountName: "SSC - Ltd" },
            bnmb: { accountNo: 123456, accountName: "SSC - Ltd" },
        }), 800);
    }, []);
  
    const handleAccordionChange = (value: string) => updateFormData('stage6', { paymentMethod: value, confirmedTransfer: false });
    const handleConfirmTransfer = (checked: boolean) => updateFormData('stage6', { confirmedTransfer: checked });
  
    const discountedPrice = calculatedPrice * (1 - 0.1); // Example 10%
    const priceDisplay = data.discountApplied ? (
        <div className="flex items-center justify-center gap-2">
           <span className="line-through text-2xl text-neutral/40 rotate-[-10deg]">{calculatedPrice.toLocaleString()}</span>
           <span>{discountedPrice.toLocaleString()} SDG</span>
        </div>
    ) : `${calculatedPrice.toLocaleString()} SDG`;

    return (
      <div className="space-y-4 w-full mx-auto md:mx-0">
          <CommonHeader title='registration.stage6.title' text='Payment Options' />
          <div className="text-center mb-6">
               <div className="text-sm text-neutral/60">{t('registration.amount_to_pay', 'Amount to Pay')}</div>
               <div className="text-4xl font-bold text-primary">{priceDisplay}</div>
          </div>
          <div className="flex gap-2">
              <Input placeholder={t('registration.referral_code', 'Referral Code')} value={data.referralCode}
                  onChange={(e) => updateFormData('stage6', {referralCode: e.target.value})}
                  className="w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base focus:shadow-md focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40" />
              <Button variant="outline" className="h-auto px-6 rounded-lg border-neutral/20 hover:bg-neutral/5 font-semibold"
                  onClick={() => { if (data.referralCode.toLowerCase() === 'ssc2025') { updateFormData('stage6', {discountApplied: true}); } }} >
                  {t('registration.apply', 'Apply')}
              </Button>
          </div>
          <Accordion type="single" collapsible className="w-full" onValueChange={handleAccordionChange} value={data.paymentMethod}>
              {['Bankak', 'Ocash', 'Fawry', 'MyCashi', 'BNMB'].map((method) => (
                  <AccordionItem key={method} value={method}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-4 w-full">
                            <div className={`w-10 h-10 rounded-base overflow-hidden flex items-center justify-center transition-colors border ${data.paymentMethod === method ? 'border-primary shadow-sm' : 'border-neutral/10'}`}>
                                <img src={`/bank_icons/${method.toLowerCase()}.jpg`} className="w-full h-full object-cover" alt={t('registration.card_alt', "icon")}/>
                            </div>
                            <span className={data.paymentMethod === method ? 'font-bold text-primary' : ''}>{method}</span>
                            {data.paymentMethod === method && (
                                <div className="ms-auto me-4 bg-success/10 text-success text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-success"></div>
                                    {t('registration.selected', 'Selected')}
                                </div>
                            )}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-neutral/5 p-4 rounded-b-lg">
                        <div className="flex flex-col items-center gap-4">
                            {bankDetails ? (
                                <div className="text-center">
                                    <div className="font-semibold">{t('registration.account_name', 'Account Name')}: {bankDetails[method.toLowerCase()]?.accountName}</div>
                                    <div className="font-mono text-lg">{bankDetails[method.toLowerCase()]?.accountNo}</div>
                                </div>
                            ) : (
                                <Spinner />
                            )}
                            <img src={`/bank_icons/${method.toLowerCase()}_qr.png`} className="w-48 h-48 object-contain rounded-base border border-primary-gray shadow-sm" alt={t('registration.qr_alt', "QR Code")} />
                            
                            <div className="flex items-center space-x-2 pt-4 border-t border-neutral/10 w-full justify-center">
                                <Checkbox 
                                    id={`confirm-${method}`} 
                                    checked={data.confirmedTransfer} 
                                    onCheckedChange={handleConfirmTransfer as any} 
                                />
                                <label htmlFor={`confirm-${method}`} className="text-sm font-medium leading-none cursor-pointer">
                                    {t('registration.transfer_confirm', 'Transfer to this account')}
                                </label>
                            </div>
                        </div>
                    </AccordionContent>
                  </AccordionItem>
              ))}
          </Accordion>
      </div>
    );
};

const Stage7 = ({ setValid }: { setValid: (v: boolean) => void }) => {
    const { t } = useTranslation();
    const { formData, updateFormData } = useRegistrationStore();
    const data = formData.stage7;
    const fileInputRef = useRef<HTMLInputElement>(null);
  
    useEffect(() => {
       setValid(!!data.referenceNumber);
    }, [data.referenceNumber, setValid]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const preview = URL.createObjectURL(file);
          const base64 = await fileToBase64(file);
          updateFormData('stage7', { receipt: base64, receiptPreview: preview });
        }
    };

    const removeReceipt = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateFormData('stage7', { receipt: null, receiptPreview: null });
    };

    // ... same JSX as before
    return (
        <div className="space-y-4 w-full mx-auto md:mx-0">
            <CommonHeader title='registration.stage7.title' text='Payment Verification' />
            <div className="space-y-1.5">
              <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.ref_number', 'Reference Number')}</Label>
              <Input value={data.referenceNumber} onChange={(e) => updateFormData('stage7', {referenceNumber: e.target.value})} placeholder="e.g. REF-123456"
                  className="w-full px-4 py-3 h-auto border border-neutral/20 shadow-sm rounded-base focus:shadow-md focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40" />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-sm font-bold text-neutral/80 ps-1">{t('registration.upload_receipt', 'Upload Receipt (Optional)')}</Label>
              <div className="border-2 border-dashed shadow-sm border-neutral/30 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer bg-white hover:bg-neutral/5 transition-colors relative"
                  onClick={() => fileInputRef.current?.click()} >
                  {data.receiptPreview ? (
                      <>
                          <button onClick={removeReceipt} className="absolute top-2 right-2 p-1 bg-neutral/10 rounded-full hover:bg-neutral/20">
                               <X className="w-4 h-4 text-neutral/70" />
                          </button>
                          <img src={data.receiptPreview} alt={t('registration.receipt_alt', "Receipt Preview")} className="h-40 object-contain" />
                      </>
                  ) : (
                      <>
                           <img src="/eva-icons (2)/fill/file-add.png" className="w-8 h-8 opacity-40 mb-2" alt={t('registration.upload_alt', "upload")} />
                           <span className="text-sm text-neutral/50">{t('registration.click_upload_receipt', 'Click to upload screenshot')}</span>
                      </>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
              </div>
            </div>
        </div>
      );
};

// --- STAGE 8: Completion ---
const Stage8 = ({ userId }: { userId: number | null }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [localStatus, setLocalStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [cloudStatus, setCloudStatus] = useState<'pending' | 'success' | 'error'>('pending');
    const [logStatus, setLogStatus] = useState<'pending' | 'success' | 'error'>('pending');
    
    // Simulate cloud sync and log creation
    useEffect(() => {
        const syncFlow = async () => {
            setLocalStatus('success');

            try {
                const syncWithCloud = () => new Promise(resolve => setTimeout(resolve, 1500));
                await syncWithCloud();
                setCloudStatus('success');
            } catch (e) {
                setCloudStatus('error');
                return; // Stop flow if cloud sync fails
            }
            
            try {
                if (userId) {
                    await api.post('/sync_logs', {
                        user_id: userId,
                        sync_type: 'full',
                        table_name: 'users',
                        status: 'success'
                    });
                    setLogStatus('success');
                } else {
                    throw new Error("User ID not available for sync log.");
                }
            } catch (err) {
                console.error("Failed to create sync log", err);
                setLogStatus('error');
            }
        };

        syncFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const isComplete = localStatus === 'success' && cloudStatus === 'success' && logStatus === 'success';

    return (
        <div className="text-center max-w-md mx-auto">
            <div className="flex flex-row gap-4 justify-center mb-4 items-center">
                <div className='bg-semantic-success rounded-full'>
                    <img src="/eva-icons (2)/outline/checkmark-circle-2.png" className='invert' />
                </div>
                
                <h1 className="text-3xl font-bold">{t('registration.success.title', 'Registration Submitted!')}</h1>

            </div>
            <p className="mb-8 leading-relaxed">
                {t('registration.success.message', 'Your registration is being processed. Please wait for the final sync to complete.')}
            </p>
            
            <div className="space-y-4">
                 <Button onClick={() => navigate('/dashboard')} className='w-full text-white' size="lg" disabled={!isComplete}>
                    {isComplete ? t('registration.go_dashboard', 'Go to Dashboard') : <Spinner />}
                </Button>
                <Link to="/help" className="block text-sm text-primary hover:underline">
                    {t('registration.report_issue', 'Report an issue')}
                </Link>
            </div>
            
            <div className="mt-4 text-sm text-neutral/60 space-y-1 text-start p-4 bg-neutral/10 rounded-lg">
                <p>Local Persistence: <span className={cn(localStatus ==='success' && 'text-green-500')}>{localStatus}</span></p>
                <p>Cloud Sync: <span className={cn(cloudStatus ==='success' && 'text-green-500')}>{cloudStatus}</span></p>
                <p>Audit Logging: <span className={cn(logStatus === 'success' && 'text-green-500')}>{logStatus}</span></p>
            </div>
        </div>
    );
};

const UnknownStage = () => {
    const { t } = useTranslation();
    return <div>{t('registration.unknown_stage', 'Unknown Stage')}</div>;
};

// --- Controller ---
const StageController = ({ stage, setStepValid, userId }: { stage: number, setStepValid: (v: boolean) => void, userId: number | null }) => {
    switch (stage) {
        case 1: return <Stage1 setValid={setStepValid} />;
        case 2: return <Stage2 setValid={setStepValid} />;
        case 3: return <Stage3 setValid={setStepValid} />;
        case 4: return <Stage4 setValid={setStepValid} />;
        case 5: return <Stage5 setValid={setStepValid} />;
        case 6: return <Stage6 setValid={setStepValid} />;
        case 7: return <Stage7 setValid={setStepValid} />;
        case 8: return <Stage8 userId={userId} />;
        default: return <UnknownStage />;
    }
};

const LanguageSelector = ({ selectedLang, onChangeLang }: { selectedLang: string, onChangeLang: (lang: string) => void }) => {
    const { t } = useTranslation();
    return (
    <Select value={selectedLang} onValueChange={onChangeLang}>
        <SelectTrigger className="flex items-center gap-4 bg-white w-fit">
            <img src="/eva-icons/fill/png/128/globe-2.png" alt={t('registration.language_alt', 'Language')} className="w-5 h-5 opacity-70"
                 onError={(e) => { e.currentTarget.style.backgroundColor = '#ccc'; e.currentTarget.style.borderRadius = '50%' }} />
            <SelectValue placeholder={selectedLang} />
        </SelectTrigger>
        <SelectContent className='bg-white'>
            <SelectGroup>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
            </SelectGroup>
        </SelectContent>
    </Select>
)};


// --- Custom Searchable Select (Mimicking style of Language Selector) ---
const SearchableSelect = ({ items, value, onValueChange, placeholder, disabled }: any) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false)
    const [inputValue, setInputValue] = useState("")

    const selectedLabel = items.find((item: any) => item.value === value)?.label

    return (
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
            <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
                "w-full justify-between px-4 py-6 border-neutral/20 shadow-sm rounded-lg focus:shadow-md hover:bg-white bg-white font-normal",
                !value && "text-muted-foreground",
                disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={disabled}
            >
            {value ? selectedLabel : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-white rounded-lg">
            <Command>
            <CommandInput placeholder={placeholder} />
            <CommandList>
                <CommandEmpty>{t('registration.search.no_results', 'No results found.')}</CommandEmpty>
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
                        onValueChange(original?.value || currentValue)
                        setOpen(false)
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
    )
}

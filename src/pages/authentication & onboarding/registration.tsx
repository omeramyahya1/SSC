import { useState, useEffect } from 'react';
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

// --- Constants ---
const TOTAL_STAGES = 7;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// --- Main Registration Component ---
export default function RegistrationScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [currentStage, setCurrentStage] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // This state would eventually be a single state object
  const [formData, setFormData] = useState({
    accountType: '',
    plan: '',
  });

  useEffect(() => {
    setIsExpanded(currentStage >= 3);
  }, [currentStage]);

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

  const handleNext = () => {
    if (currentStage < TOTAL_STAGES) {
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

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[var(--color-bg)] overflow-hidden">
       <InternetAlert isOnline={isOnline} />

      {/* Main Grid Container */}
      <div className={`w-full min-h-screen grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-cols-[0fr_1fr]' : 'md:grid-cols-[1fr_2fr]'}`}>

        {/* --- LEFT PANEL --- */}
        <LeftPanel isVisible={!isExpanded} />
        
        {/* --- RIGHT PANEL (MAIN CONTENT) --- */}
        <div className="relative w-full bg-[var(--color-bg)] p-8 md:p-12 flex flex-col">
          {/* Header */}
          <header className="relative flex items-center justify-between w-full mb-8 h-9">
            {/* Back Button */}
            {currentStage > 1 && (
              <button 
                onClick={handleBack} 
                className="h-full border shadow-sm rounded-base flex items-center px-2 gap-4 text-neutral/70 z-20 bg-white" >
                <img src="/eva-icons/fill/png/128/chevron-left.png" alt={t('registration.back_alt', 'Back')} className={`w-5 h-5 opacity-70 transition-transform duration-300 ${i18n.language === 'ar' ? 'rotate-180' : ''}`}  />
                <span >{t('registration.back', 'Back')}</span>
              </button>
            )}

            {/* Language Switcher */}
            <div className="absolute top-0 end-0 z-10">
              <LanguageSelector selectedLang={i18n.language} onChangeLang={toggleLanguage} />
            </div>
          </header>

          {/* Stage Controller */}
          <main className="flex-grow flex items-center justify-center">
            {/* The transition classes create a slide-in effect */}
            <div key={currentStage} className="w-full max-w-md animate-in slide-in-from-right-16 duration-300">
               <StageController stage={currentStage} formData={formData} setFormData={setFormData} />
            </div>
          </main>


          {/* Footer */}
          <footer className="relative pt-8 mt-auto">
            <div className="flex items-center justify-between">
              {/* Placeholder for alignment */}
              <div className="w-24"></div>

              {/* Progress Bar */}
              <div className="w-full max-w-xs mx-auto">
                <Progress value={progressPercentage} className="h-3 bg-white border border-x-primary-gray" />
                <p className="text-center text-sm text-neutral/60 mt-2">
                  {currentStage} {t('registration.stage_progress', `of`)}  {TOTAL_STAGES}
                </p>
              </div>

              {/* Next Button */}
              <div className="w-24 flex justify-end">
                {currentStage < TOTAL_STAGES && (
                  <Button onClick={handleNext} disabled={!isOnline} className='text-white'>
                    {t('registration.next', 'Next')}
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


// --- Sub-components ---

const LeftPanel = ({ isVisible }: { isVisible: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className={`bg-primary text-white p-8 flex-col justify-between relative overflow-hidden transition-all duration-500 ease-in-out rounded-3xl mt-5 ms-5 mb-5 ${isVisible ? 'flex opacity-100' : 'opacity-0'}`}>
        {/* Top: Logo section */}
        <div className="flex items-center gap-4 relative z-10">
          {/* Placeholder for local logo file */}
          <img 
            src="/ssc.svg" 
            alt="SSC Logo" 
            className="w-12 h-12 bg-white/30 p-2 rounded-base backdrop-blur-sm"/>
           <div className="hidden w-12 h-12 bg-white/20 rounded-base items-center justify-center font-bold">S</div>
          <span className="text-3xl font-extrabold tracking-wider">SSC</span>
        </div>
        
        {/* Banner Text */}
        <div className="my-12 md:my-auto relative z-10">
          <h2 className="text-4xl font-bold mb-6 leading-tight text-white">
            {t('registration.banner.title', "Try it for free!")}
          </h2>
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            {t('registration.banner.subtitle', "Start a 7-day free trial now! No registration required")}
          </p>
        </div>

        {/* Bottom: Footer links */}
        <div className="flex items-center justify-between text-sm font-medium relative z-10 pt-6 border-t border-white/30">
          <button type="button" className="hover:text-primary-lighter transition-colors hover:underline"
            onClick={() => navigate("/")}
          >
            {t('registration.login_link', "Login")}
          </button>
          <button type="button" className="hover:text-primary-lighter transition-colors hover:underline"
            onClick={() => navigate("/help")}
          >
            {t('login.need_help', "Need Help?")}
          </button>
        </div>
    </div>
  );
};


const StageController = ({ stage, formData, setFormData }: { stage: number, formData: any, setFormData: any }) => {
    const { t } = useTranslation();

    const commonHeader = (title: string, text: string) => <h1 className="text-3xl font-bold text-center text-neutral mb-8">{t(title, text)}</h1>;

    switch (stage) {
        case 1:
            return <div>{commonHeader('registration.stage1.title', 'Basic Info')}
                <p className='text-center text-neutral/60'>{t('registration.stage1.fields', 'Username, Email, Password, Confirm Password')}</p>
            </div>;
        case 2:
            return <div>{commonHeader('registration.stage2.title', 'Account Type')}
                <p className='text-center text-neutral/60'>{t('registration.stage2.options', 'Standard, Enterprise')}</p>
            </div>;
        case 3:
            const isStandard = formData.accountType === 'Standard';
            return <div>{commonHeader(isStandard ? 'registration.stage3.standard_title' : 'registration.stage3.enterprise_title', isStandard ? 'Choose Plan' : 'What suits you best?')}
                 <p className='text-center text-neutral/60'>{isStandard ? t('registration.stage3.standard_options', 'Monthly, Annual, Lifetime') : t('registration.stage3.enterprise_options', 'Tier 1, Tier 2')}</p>
            </div>;
        case 4:
            return (
              <div className="text-center">
                  {commonHeader('registration.stage4.title', 'Summary & Review')}
                  <p className="text-neutral/70 mb-2">{t('registration.stage4.account_type', 'Account Type')}: {formData.accountType || t('registration.not_applicable', 'N/A')}</p>
                  <p className="text-neutral/70 mb-6">{t('registration.stage4.plan', 'Plan / Tier')}: {formData.plan || t('registration.not_applicable', 'N/A')}</p>
                  <div className="flex items-center justify-center space-x-2">
                      <Checkbox id="terms" />
                      <label htmlFor="terms" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {t('registration.stage4.terms', "I have read and agree to the terms and conditions")}
                      </label>
                  </div>
              </div>
            );
        case 5:
            return <div>{commonHeader('registration.stage5.title', 'Finalize Payment')}
                <p className='text-center text-neutral/60'>{t('registration.stage5.description', 'List of payment methods')}</p>
            </div>;
        case 6:
            return <div>{commonHeader('registration.stage6.title', 'Payment Verification')}
                <p className='text-center text-neutral/60'>{t('registration.stage6.description', 'Reference number (mandatory), Receipt screenshot (optional)')}</p>
            </div>;
        case 7:
            return (
              <div className="text-center">
                  {commonHeader('registration.stage7.title', 'Success!')}
                  <p className="text-neutral/70 mb-6">{t('registration.stage7.message', 'Your payment is under processing for 24 hours')}</p>
                  <p className="text-sm text-primary hover:underline cursor-pointer mb-8">{t('registration.stage7.report_issue', 'Report an issue')}</p>
                  <Link to="/dashboard">
                    <Button
                      className='text-white'
                    >
                      {t('registration.stage7.go_to_dashboard', 'Go to dashboard')}</Button>
                  </Link>
              </div>
            );
        default:
            return <div>{t('registration.unknown_stage', 'Unknown Stage')}</div>;
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


const InternetAlert = ({ isOnline }: { isOnline: boolean }) => {
  const { t } = useTranslation();
  const [showAlert, setShowAlert] = useState(true);

if (!isOnline) {
  if (showAlert) {
    return (
  <div className="fixed top-0 inset-x-0 z-50 p-4 w-fit max-w-md mx-auto animate-in slide-in-from-top-16 duration-300">
    <Alert className="bg-yellow-100 border-yellow-500 text-yellow-900 shadow-sm rounded-base gap-2">
      <div className="relative flex flex-col items-center">
        {/* Close button */}
        <button
          className="absolute start-2 top-2 font-bold opacity-70 hover:opacity-100"
          onClick={() => setShowAlert(false)}
          aria-label="Close alert"
        >
          ✕
        </button>

        {/* Icon */}
        <img
          src="/eva-icons (2)/fill/alert-triangle.png"
          className="h-5 w-5 opacity-70 mb-1"
          alt={t('registration.warning_alt', 'Warning')}
        />

        <AlertTitle className="text-yellow-900 font-bold text-center">
          {t('registration.warning_title', 'Warning')}
        </AlertTitle>

        <AlertDescription className="text-yellow-900 text-center">
          {t(
            'registration.internet_required',
            'Internet is required to continue the registration process.'
          )}
        </AlertDescription>
      </div>
    </Alert>
  </div>
);
  }
}



};

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function InternetAlert() {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showInternetAlert, setShowInternetAlert] = useState(!navigator.onLine);
  const [showRestoredAlert, setShowRestoredAlert] = useState(false);

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

  if (showInternetAlert && !isOnline) {
    return (
      <div className="fixed top-4 inset-x-0 z-50 p-4 w-fit max-w-md mx-auto animate-in slide-in-from-top-16 duration-300">
        <Alert className="bg-yellow-100 border-yellow-500 text-yellow-900 shadow-sm rounded-base gap-2">
          <div className="relative flex flex-col items-center">
            <img src="/eva-icons (2)/fill/alert-triangle.png" className="h-5 w-5 opacity-70 mb-1" alt={t('registration.warning_alt', 'Warning')} />
            <AlertTitle className="text-yellow-900 font-bold text-center">{t('dashboard.no_internet_title', 'No Internet Connection')}</AlertTitle>
            <AlertDescription className="text-yellow-900 text-center">{t('dashboard.no_internet_desc', 'Your internet connection is unstable.')}</AlertDescription>
          </div>
        </Alert>
      </div>
    );
  }

  if (showRestoredAlert && isOnline) {
    return (
      <div className="fixed top-4 inset-x-0 z-50 p-4 w-fit max-w-md mx-auto animate-in slide-in-from-top-16 duration-300">
        <Alert className="bg-green-100 border-green-500 text-green-900 shadow-sm rounded-base gap-2">
          <div className="relative flex flex-col items-center">
            <img src="/eva-icons (2)/outline/checkmark-circle-2.png" className="h-5 w-5 opacity-70 mb-1 filter invert-[.35] sepia-[1] saturate-[3] hue-rotate-[90deg]" alt={t('registration.success_alt', 'Success')} />
            <AlertTitle className="text-green-900 font-bold text-center">{t('registration.internet_restored_title', 'Internet Restored')}</AlertTitle>
            <AlertDescription className="text-green-900 text-center">{t('dashboard.internet_restored_desc', 'Your internet connection is back.')}</AlertDescription>
          </div>
        </Alert>
      </div>
    );
  }

  return null;
}

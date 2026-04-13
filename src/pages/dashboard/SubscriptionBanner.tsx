import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
import { useUserStore } from "@/store/useUserStore";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function SubscriptionBanner() {
    const { t } = useTranslation();
    const { currentUser } = useUserStore();
    const { currentSubscription, fetchSubscriptions } = useSubscriptionStore();
    const subscriptionStatus = currentUser?.status; // Using user status as per `useUserStore`

    useEffect(() => {
        if (currentUser?.uuid) {
            fetchSubscriptions(currentUser.uuid);
        }
    }, [currentUser, fetchSubscriptions]);

    if (subscriptionStatus === 'grace') {
        let graceDaysLeft = 0;
        if (currentSubscription?.grace_period_end) {
            const endDate = new Date(currentSubscription.grace_period_end);
            const today = new Date();
            const diffTime = endDate.getTime() - today.getTime();
            graceDaysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        }
        return (
            <div className="w-full p-2">
                <Alert variant="destructive" className="bg-yellow-100 border-yellow-500 text-yellow-800">
                    <AlertTitle>{t('dashboard.grace_title', 'Subscription in Grace Period')}</AlertTitle>
                    <AlertDescription>
                        {t('dashboard.grace_desc', { count: graceDaysLeft }, `Your subscription expires in ${graceDaysLeft} days. Renew now to avoid service interruption.`)}
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    if (subscriptionStatus === 'expired') {
        return (
            <div className="w-full p-2">
                <Alert variant="destructive">
                    <AlertTitle>{t('dashboard.expired_title', 'Subscription Expired')}</AlertTitle>
                    <AlertDescription>
                        {t('dashboard.expired_desc', 'Your access is now view-only. Please renew your subscription to restore full functionality.')}
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return null;
}

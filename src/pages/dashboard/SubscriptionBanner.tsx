import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSubscriptionStore } from "@/store/useSubscriptionStore";
import { useUserStore } from "@/store/useUserStore";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function SubscriptionBanner() {
    const { t } = useTranslation();
    const { currentUser } = useUserStore();
    const { currentSubscription, fetchSubscription } = useSubscriptionStore();
    const subscriptionStatus = currentUser?.status; // Using user status as per `useUserStore`

    useEffect(() => {
        // Assuming there is a way to get the subscription id, maybe from user
        // For now, let's assume we can fetch it. If user has no subscription, this will fail gracefully.
        if (currentUser?.user_id) {
            // This is a placeholder, you might need a dedicated `fetchSubscriptionByUserId`
            // fetchSubscription(currentUser.user_id);
        }
    }, [currentUser, fetchSubscription]);

    // For demonstration, we'll just use the status from the user object.

    if (subscriptionStatus === 'grace') {
        const graceDaysLeft = 7; // Dummy data
        return (
            <div className="w-full p-2">
                <Alert variant="destructive" className="bg-yellow-100 border-yellow-500 text-yellow-800">
                    <AlertTitle>{t('dashboard.grace_title', 'Subscription in Grace Period')}</AlertTitle>
                    <AlertDescription>
                        {t('dashboard.grace_desc', `Your subscription expires in ${graceDaysLeft} days. Renew now to avoid service interruption.`)}
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

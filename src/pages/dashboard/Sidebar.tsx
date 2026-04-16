import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { SettingsModal } from './SettingsModal';
import { SupportModal } from './SupportModal';
import { PlanModal } from '../subscription/PlanModal';
import { useUserStore } from '@/store/useUserStore';
import { useSubscriptionStore } from '@/store/useSubscriptionStore';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SidebarClose, SidebarOpen, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const SidebarItem = ({ icon, text, children, to, onClick, isSelected, showSidebarContent}: { icon: string, text: string, to?: string, onClick?: () => void, children?: React.ReactNode, isSelected?: boolean, showSidebarContent: boolean}) => {
    const { i18n } = useTranslation();

    const content = (
        <div className={`flex flex-row gap-4 ${!showSidebarContent ? 'justify-center' : 'justify-start'}`}>
            {
                icon !== "sales" ? (
                    <img src={icon} alt="" className={`w-6 h-6 opacity-40 group-hover:opacity-100`} />
                ) : (
                    <img src="/eva-icons (2)/outline/banknote.png" alt="" className={`w-6 h-6 opacity-40 group-hover:opacity-100`} />
                )
            }
            {showSidebarContent && <span className="truncate font-bold">{text}</span>}
            {children}
        </div>
    );

    if (to) {
        return (
            <NavLink
                to={to}
                className={({ isActive }) =>
                    `w-full group justify-start gap-4 px-4 h-12 text-md rounded-lg hover:bg-white hover:shadow-sm flex items-center ${isActive && !isSelected ? 'bg-white shadow-sm [&_img]:opacity-100' : ''}`
                }
            >
                {content}
            </NavLink>
        );
    }

    return (
        <Button variant="ghost" dir={i18n.dir()} className={`w-full group justify-start gap-4 px-4 h-12 text-md rounded-lg hover:bg-white hover:shadow-sm ${isSelected ? 'bg-white shadow-sm [&_img]:opacity-100' : ''}`} onClick={onClick}>
            {content}
        </Button>
    );
};

const SubscriptionDetails = ({ onOpenModal }: { onOpenModal: () => void }) => {
    const { t, i18n } = useTranslation();
    const { currentUser } = useUserStore();
    const { currentSubscription } = useSubscriptionStore();
    const accountType = currentUser?.account_type;
    const userRole = currentUser?.role;

    if (accountType === 'enterprise' && userRole !== 'admin') {
        return (
            <PopoverContent className="w-80 bg-white" dir={i18n.dir()}>
                <div className="flex flex-col gap-2">
                     <h4 className="font-bold">{t('dashboard.organization_plan', 'Organization Plan')}</h4>
                     <p className="text-sm text-muted-foreground">{t('dashboard.org_plan_desc', 'You are subscribed to the organization plan.')}</p>
                     <p className="text-xs text-primary font-bold"> {currentUser?.org_name} </p>
                </div>
            </PopoverContent>
        );
    }

    const expiryDate = currentSubscription?.expiration_date ? new Date(currentSubscription.expiration_date).toLocaleDateString() : 'N/A';
    const isGrace = currentUser?.status === 'grace';
    const isTrial = currentUser?.status === 'trial';
    const isExpired = currentUser?.status === 'expired';

    return (
        <PopoverContent className="w-80 bg-white" dir={i18n.dir()}>
            <div className="grid gap-4">
                <div className="space-y-2">
                    <h2 className="text-sm text-muted-foreground">
                        {t('dashboard.sub_details_desc', 'Your current subscription details.')}
                    </h2>
                </div>
                {(accountType === 'standard' || accountType?.startsWith('enterprise')) && (
                    <div className="grid gap-2">
                        <div className="grid grid-cols-2 items-center gap-4">
                            <span>{t('dashboard.status', 'Status')}:</span>
                            <span className={cn(
                                "font-bold",
                                (isGrace || isTrial) ? "text-yellow-600" : isExpired ? "text-red-600" : "text-green-600"
                            )}>
                                {isGrace ? t('dashboard.grace', 'Grace Period') :
                                 isTrial ? t('dashboard.trial', 'Trial') :
                                 isExpired ? t('dashboard.expired', 'Expired') :
                                 t('dashboard.active', 'Active')}
                            </span>
                        </div>
                         <div className="grid grid-cols-2 items-center gap-4">
                            <span>{t('dashboard.end_date', 'End Date')}:</span>
                            <span className="font-bold">{expiryDate}</span>
                        </div>
                        {isGrace && currentSubscription?.grace_period_end && (
                            <div className="text-[10px] text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-100 flex items-start gap-1">
                                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{t('dashboard.grace_warning', 'Grace period ends on')} {new Date(currentSubscription.grace_period_end).toLocaleDateString()}</span>
                            </div>
                        )}
                        <Button className="mt-2 w-full text-white" onClick={onOpenModal}>{currentUser?.status === 'active' ? t('dashboard.plan_details', 'View Plan Details') : t('dashboard.renew_upgrade', 'Renew / Upgrade')}</Button>
                    </div>
                )}
                 {(accountType as any) === 'lifetime' && (
                    <div className="grid gap-2 text-center p-4 bg-gray-100 rounded-md">
                        <span className="font-bold">{t('dashboard.lifetime_license', 'Lifetime License')}</span>
                    </div>
                )}
            </div>
        </PopoverContent>
    );
};

export function Sidebar() {
    const { t, i18n } = useTranslation();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [nonNavSelected, setNonNavSelected] = useState<string | null>(null);
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const location = useLocation();

    const { currentUser } = useUserStore();
    const { currentSubscription, fetchSubscriptions } = useSubscriptionStore();

    const [subscriptionFetched, setSubscriptionFetched] = useState(false);

    useEffect(() => {
        setNonNavSelected(null);
    }, [location.pathname]);

    useEffect(() => {
        if (!currentSubscription && currentUser?.uuid && !subscriptionFetched) {
            fetchSubscriptions(currentUser.uuid).finally(() => setSubscriptionFetched(true));
         }
    }, [currentSubscription, fetchSubscriptions, currentUser?.uuid, subscriptionFetched]);

    const handleSync = () => {
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 2000);
    };

    const showSidebarContent = !isCollapsed;

    return (
        <>
        <Dialog onOpenChange={(open) => !open && setNonNavSelected(null)}>
            <div
                className={`flex flex-col bg-primary-gray transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}
                onMouseEnter={() => { setIsHovering(true) }}
                onMouseLeave={() => { setIsHovering(false) }}
                dir={i18n.dir()}
            >
                {/* Header */}
                <div className={`flex items-center p-4 h-20 ${showSidebarContent ? 'justify-between' : 'justify-center'}`}>
                   {
                    isCollapsed && isHovering? (
                        <Button variant="outline" size="icon" onClick={() => setIsCollapsed(!isCollapsed)} className={`group ${isCollapsed ? 'hover:bg-gray-700' : 'bg-gray-700'}`}>
                            <SidebarOpen className={`h-6 w-6 text-gray-700 group-hover:text-white ${i18n.dir() === 'rtl' && 'rotate-180'}`}/>
                        </Button>

                    ) : (
                        <img src="/ssc.svg"
                        alt="SSC Logo"
                        className="w-12 h-12 bg-white/90 p-2 rounded-base backdrop-blur-lg" />
                    )
                   }
                    {showSidebarContent &&
                        <Button variant="outline" size="icon" onClick={() => {setIsCollapsed(!isCollapsed); setIsHovering(false)}} className={`group ${isCollapsed ? 'hover:bg-gray-700' : 'bg-gray-700 hover:bg-white'}`}>
                            <SidebarClose className={`h-6 w-6 text-white group-hover:text-gray-700 ${i18n.dir() === 'rtl' && 'rotate-180'}`}/>
                        </Button>
                    }
                </div>

                {/* Nav Items */}
                <nav className="flex-grow px-2 space-y-2 pt-4" >
                    <div className="space-y-1">
                        <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/grid.png" text={t('dashboard.dashboard', 'Dashboard')} to="/home/dashboard" isSelected={nonNavSelected !== null} />
                        <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/people.png" text={t('dashboard.customers', 'Customers')} to="/home/customers" isSelected={nonNavSelected !== null} />
                    </div>
                    <Separator className="bg-gray-700 my-2" />
                    <div className="space-y-1">
                        <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/archive.png" text={t('dashboard.inventory', 'Inventory')} to="/home/inventory" isSelected={nonNavSelected !== null} />
                        <SidebarItem showSidebarContent={showSidebarContent} icon="sales" text={t('dashboard.Sales', 'Sales')} to="/home/sales" isSelected={nonNavSelected !== null} />
                    </div>
                    <Separator className="bg-gray-700 my-2" />
                     <div className="space-y-1">
                        {
                            currentUser?.role === 'admin' && (
                                <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/building.png" text={t('dashboard.team', 'Team / Organization')} to="/home/team" isSelected={nonNavSelected !== null}/>
                            )
                        }
                        <Popover onOpenChange={(open) => !open && setNonNavSelected(null)}>
                            <PopoverTrigger asChild>
                                <div onClick={() => setNonNavSelected('subscription')}>
                                    <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/credit-card.png" text={t('dashboard.subscription', 'My Plan')} isSelected={nonNavSelected === 'subscription'} />
                                </div>
                            </PopoverTrigger>
                            <SubscriptionDetails onOpenModal={() => setIsPlanModalOpen(true)} />
                        </Popover>
                    </div>
                     <Separator className="bg-gray-700 my-2" />
                     <div className="space-y-1">
                        <Dialog onOpenChange={(open) => !open && setNonNavSelected(null)}>
                            <DialogTrigger asChild>
                                <div onClick={() => setNonNavSelected('support')}>
                                    <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/question-mark-circle.png" text={t('dashboard.support', 'Support')} isSelected={nonNavSelected === 'support'} />
                                </div>
                            </DialogTrigger>
                            <SupportModal />
                        </Dialog>
                        <Dialog onOpenChange={(open) => !open && setNonNavSelected(null)}>
                            <DialogTrigger asChild>
                                <div onClick={() => setNonNavSelected('settings')}>
                                    <SidebarItem showSidebarContent={showSidebarContent} icon="/eva-icons (2)/outline/settings-2.png" text={t('dashboard.settings', 'Settings')} isSelected={nonNavSelected === 'settings'} />
                                </div>
                            </DialogTrigger>
                            <SettingsModal />
                        </Dialog>
                    </div>
                </nav>

                {/* Footer */}
                <div className="p-4">
                    <Button variant="ghost" className={`w-full gap-4 px-2 h-12 rounded-lg hover:bg-white hover:shadow-sm group ${isCollapsed ? 'justify-center' : 'justify-start'}`} onClick={handleSync}>
                        {isSyncing ? <Spinner className="w-6 h-6" /> : <img src="/eva-icons (2)/outline/sync.png" alt={t('common.synced_alt', 'synced')} className="w-6 h-6 opacity-40 group-hover:opacity-100" />}
                         {showSidebarContent && <span className="truncate">{isSyncing ? t('dashboard.syncing', 'Syncing...') : t('dashboard.synced', 'Synced')}</span>}
                    </Button>
                </div>
            </div>
        </Dialog>
        <PlanModal isOpen={isPlanModalOpen} onOpenChange={setIsPlanModalOpen} />
        </>
    );
}

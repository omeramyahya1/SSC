import { useTranslation } from 'react-i18next';
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, MessageCircle, Phone, Globe, ExternalLink } from "lucide-react";

export function SupportModal() {
    const { t, i18n } = useTranslation();

    const supportChannels = [
        {
            icon: <Mail className="w-5 h-5 text-primary" />,
            title: t('support.email', 'Email Support'),
            value: 'support@ssc.com',
            action: () => window.location.href = 'mailto:support@ssc.com'
        },
        {
            icon: <MessageCircle className="w-5 h-5 text-green-600" />,
            title: t('support.whatsapp', 'WhatsApp'),
            value: '+249 123 456 789',
            action: () => window.open('https://wa.me/249123456789', '_blank')
        },
        {
            icon: <Globe className="w-5 h-5 text-blue-600" />,
            title: t('support.website', 'Help Center'),
            value: 'www.ssc.com/help',
            action: () => window.open('https://ssc.com/help', '_blank')
        }
    ];

    return (
        <DialogContent className="max-w-md p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl">
            <DialogHeader className="p-6 bg-primary text-white">
                <DialogTitle className="text-2xl font-black">{t('support.title', 'Customer Support')}</DialogTitle>
                <DialogDescription className="text-white/70 font-medium">
                    {t('support.description', 'How can we help you today? Our team is here to assist.')}
                </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh] p-6">
                <div className="space-y-4">
                    <p className="text-sm font-bold text-neutral/40 uppercase tracking-widest mb-2">
                        {t('support.channels', 'Contact Channels')}
                    </p>
                    
                    {supportChannels.map((channel, index) => (
                        <Card key={index} className="border-none bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group" onClick={channel.action}>
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                                    {channel.icon}
                                </div>
                                <div className="flex-grow">
                                    <p className="text-xs font-bold text-neutral/40 uppercase">{channel.title}</p>
                                    <p className="font-bold text-neutral/80">{channel.value}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-neutral/20 group-hover:text-primary transition-colors" />
                            </CardContent>
                        </Card>
                    ))}

                    <div className="mt-8 p-6 bg-primary/5 rounded-2xl border border-primary/10 text-center">
                        <p className="text-sm font-bold text-primary mb-4">
                            {t('support.hours', 'Working Hours: Sun - Thu, 9AM - 5PM')}
                        </p>
                        <Button className="w-full h-12 text-white font-bold rounded-xl shadow-lg shadow-primary/20">
                            {t('support.open_ticket', 'Open Support Ticket')}
                        </Button>
                    </div>
                </div>
            </ScrollArea>
        </DialogContent>
    );
}

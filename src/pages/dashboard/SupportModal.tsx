import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mail, MessageCircle, ExternalLink, Copy, Check } from "lucide-react";
import { openUrl } from '@tauri-apps/plugin-opener';
import { supabase } from '@/lib/supabaseClient';

export function SupportModal() {
    const { t, i18n } = useTranslation();
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [phoneNo, setPhoneNo] = useState('');
    const handleCopy = (e: React.MouseEvent, value: string, id: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };


    useEffect(() => {
        const fetchContacts = async () => {
            try {
                const { data, error } = await supabase.rpc('get_support_channels');
                if (error) throw error;
                if (data) {
                    setEmail(data.email || '');
                    setPhoneNo(data.whatsapp || '');
                }
            } catch (error) {
                console.error("Failed to fetch support contacts:", error);
            }
        };
        fetchContacts();
    }, []);

    const supportChannels = [
        {
            id: 'email',
            icon: <Mail className="w-5 h-5 text-primary" />,
            title: t('support.email', 'Email Support'),
            value: email,
            action: () => email && openUrl(`mailto:${email}`)
        },
        {
            id: 'whatsapp',
            icon: <MessageCircle className="w-5 h-5 text-green-600" />,
            title: t('support.whatsapp', 'WhatsApp'),
            value: phoneNo,
            action: () => phoneNo && openUrl(`https://wa.me/${phoneNo.replace(/\s+/g, '').replace('+', '')}`)
        }
    ];

    return (
        <DialogContent className="max-w-md p-0 overflow-hidden bg-white border-none rounded-3xl shadow-2xl" dir={i18n.dir()}>
            <DialogHeader className="p-6">
                <DialogTitle className="text-2xl font-black">{t('support.title', 'Customer Support')}</DialogTitle>
                <DialogDescription className="font-medium">
                </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh] p-6" dir={i18n.dir()}>
                <div className="space-y-4">
                    <p className="text-sm font-bold text-neutral/40 mb-2">
                        {t('support.channels', 'Contact Channels')}
                    </p>

                    {supportChannels.map((channel, index) => (
                        <Card key={index} className="border-none bg-gray-50 hover:bg-gray-100 transition-colors group">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="bg-white p-3 rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                                    {channel.icon}
                                </div>
                                <div className="flex-grow">
                                    <p className="text-xs font-bold text-neutral/40 uppercase" >{channel.title}</p>
                                    <p className={`font-bold text-neutral/80 ${i18n.dir() === 'ltr' ? 'text-start' : 'text-end'}`} dir={'ltr'}>{channel.value}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg hover:bg-white transition-colors"
                                        onClick={(e) => handleCopy(e, channel.value, channel.id)}
                                    >
                                        {copiedId === channel.id ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-neutral/20 group-hover:text-primary transition-colors" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg hover:bg-white transition-colors"
                                        onClick={channel.action}
                                    >
                                        <ExternalLink className="w-4 h-4 text-neutral/20 group-hover:text-primary transition-colors" />
                                    </Button>
                                </div>
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

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageCircle, ExternalLink, Copy, Check, ArrowLeft, Send } from "lucide-react";
import { openUrl } from '@tauri-apps/plugin-opener';
import { supabase } from '@/lib/supabaseClient';
import { motion, AnimatePresence } from "framer-motion";
import {toast} from 'react-hot-toast';
import { useUserStore } from '@/store/useUserStore';

export function SupportModal() {
    const { t, i18n } = useTranslation();
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [phoneNo, setPhoneNo] = useState('');
    const [view, setView] = useState<'channels' | 'ticket'>('channels');

    const { currentUser } = useUserStore();

    // Ticket Form State
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const handleSubmitTicket = async () => {
        if (!subject.trim() || !body.trim()) {
            toast.error(t('support.error_fields', 'Please fill in all fields'));
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.rpc('support_ticket', {
                subject: subject.trim(),
                body: body.trim(),
                user_uuid: String(currentUser?.uuid)
            });

            if (error) throw error;

            toast.success(t('support.ticket_sent', 'Support ticket sent successfully!'));
            setSubject('');
            setBody('');
            setView('channels');
        } catch (error) {
            console.error("Failed to submit ticket:", error);
            toast.error(t('support.submit_failed', 'Failed to send ticket. Please try again.'));
        } finally {
            setIsSubmitting(false);
        }
    };

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
            <DialogHeader className="p-6 pb-2">
                <div className="flex items-center gap-2">
                    {view === 'ticket' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-8 w-8"
                            onClick={() => setView('channels')}
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    )}
                    <DialogTitle className="text-2xl font-black">
                        {view === 'channels' ? t('support.title', 'Customer Support') : t('support.open_ticket', 'Open Support Ticket')}
                    </DialogTitle>
                </div>
            </DialogHeader>

            <ScrollArea className="max-h-[70vh]" dir={i18n.dir()}>
                <div className="p-6 pt-2">
                    <AnimatePresence mode="wait">
                        {view === 'channels' ? (
                            <motion.div
                                key="channels"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="space-y-4"
                            >
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
                                    <Button
                                        className="w-full h-12 text-white font-bold rounded-xl shadow-lg shadow-primary/20"
                                        onClick={() => setView('ticket')}
                                    >
                                        {t('support.open_ticket', 'Open Support Ticket')}
                                    </Button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="ticket"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-4"
                            >
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral/40 uppercase">
                                        {t('support.subject', 'Subject')}
                                    </label>
                                    <Input
                                        placeholder={t('support.subject_placeholder', 'How can we help?')}
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        className="bg-gray-50 border-none rounded-xl h-12 font-medium"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-neutral/40 uppercase">
                                        {t('support.message', 'Message')}
                                    </label>
                                    <Textarea
                                        placeholder={t('support.message_placeholder', 'Describe your issue in detail...')}
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        className="bg-gray-50 border-none rounded-2xl min-h-[150px] font-medium resize-none p-4"
                                    />
                                </div>

                                <Button
                                    className="w-full h-12 text-white font-bold rounded-xl shadow-lg shadow-primary/20 mt-4 gap-2"
                                    onClick={handleSubmitTicket}
                                    disabled={isSubmitting || !subject.trim() || !body.trim()}
                                >
                                    {isSubmitting ? (
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                    {t('support.send_ticket', 'Send Support Ticket')}
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </ScrollArea>
        </DialogContent>
    );
}


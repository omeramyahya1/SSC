import { useState, useEffect } from 'react';
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { AlertCircle, CheckCircle2, ArrowLeft, Key, Mail, Lock, ArrowRight } from "lucide-react";
import api from '@/api/client';
import toast from 'react-hot-toast';
import i18n from '@/i18';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';

type ResetStage = 'request' | 'verify' | 'reset' | 'success';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [stage, setStage] = useState<ResetStage>('request');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [isEmailValid, setIsEmailValid] = useState(true);
    const [showPassword, setShowPassword] = useState(false);


    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(0); // Timer in seconds

    const toggleLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
    };

    useEffect(() => {
        // Only pre-fill if not logged in and a previous user's email is available
          setIsEmailValid(EMAIL_REGEX.test(email)); // Validate pre-filled email
        }, [email]);

    useEffect(() => {
            setError(null);

            if (newPassword.length > 0 && newPassword.length < 6) {
                setError(t('registration.password_hint', 'Min 6 chars, at least 1 number'));
            } else if (newPassword.length > 0 && !(/\d/).test(newPassword)) {
                setError(t('registration.password_hint_number', 'Password must contain at least one number.'));
            }

            if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
                setError(t('registration.passwords_mismatch', 'Passwords do not match.'));
            }
    }, [newPassword, confirmPassword, t]);

    // Countdown timer for the verification code
    useEffect(() => {
        if (timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await api.post('/authentications/request-reset', { email });
            setStage('verify');
            setTimeLeft(600); // 10 minutes
            toast.success(t('forgot_password.code_sent'));
        } catch (err: any) {
            setError(err.response?.data?.error || t('forgot_password.request_error'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await api.post('/authentications/verify-code', { email, code });
            setStage('reset');
            toast.success(t('forgot_password.code_verified'));
        } catch (err: any) {
            setError(err.response?.data?.error || t('forgot_password.verify_error'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            setError(t('forgot_password.password_mismatch'));
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await api.post('/authentications/reset-password', { email, new_password: newPassword });
            setStage('success');
            toast.success(t('forgot_password.reset_success'));
        } catch (err: any) {
            setError(err.response?.data?.error || t('forgot_password.reset_error'));
        } finally {
            setIsLoading(false);
        }
    };

    const renderHeader = () => {
        const titles = {
            request: t('forgot_password.request_title'),
            verify: t('forgot_password.verify_title'),
            reset: t('forgot_password.reset_title'),
            success: t('forgot_password.success_title')
        };
        const descriptions = {
            request: t('forgot_password.request_desc'),
            verify: t('forgot_password.verify_desc', { email }),
            reset: t('forgot_password.reset_desc'),
            success: t('forgot_password.success_desc')
        };

        return (
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-neutral mb-2">{titles[stage]}</h1>
                <p className="text-neutral/60">{descriptions[stage]}</p>
            </div>
        );
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
            {/* Language Switcher - Absolute Top End Corner */}
            <div className="absolute top-6 end-6 flex items-center gap-3 bg-[var(--color-bg)] ps-3 pe-2 py-1.5 transition-all hover:border-primary/30 font-medium text-sm text-neutral/80">
            {/* Placeholder for local globe icon */}
            <Select value={i18n.language} onValueChange={toggleLanguage} dir={i18n.dir()}>
                <SelectTrigger className="flex items-center gap-4 relative z-10 bg-white">
                    <img src="/eva-icons/fill/png/128/globe-2.png" alt="Language" className="w-5 h-5 opacity-70"
                    onError={(e) => {e.currentTarget.style.backgroundColor='#ccc'; e.currentTarget.style.borderRadius='50%'}}/>
                    <SelectValue placeholder={i18n.language} />
                </SelectTrigger>
                <SelectContent className='bg-white'>
                    <SelectGroup>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar">العربية</SelectItem>
                    </SelectGroup>
                </SelectContent>
            </Select>
            </div>

            <div className="w-full max-w-md bg-white border-[1px] rounded-3xl shadow-xl p-8 md:p-12">
                <header className="flex justify-between items-center mb-6">
                    {stage !== 'success' && (
                        <button
                            onClick={() => stage === 'request' ? navigate('/') : setStage('request')}
                            className="p-2 hover:bg-neutral/5 rounded-full transition-colors"
                        >
                            {
                                i18n.dir() === 'ltr' ? (
                                    <ArrowLeft className="w-6 h-6 text-neutral/60" />
                                ) : (
                                    <ArrowRight className="w-6 h-6 text-neutral/60" />
                                )
                            }

                        </button>
                    )}
                    <div className="mx-auto">
                        <img src="/ssc.svg" alt="SSC Logo" className="w-12 h-12" />
                    </div>
                    <div className="w-10"></div> {/* Spacer for symmetry */}
                </header>

                {renderHeader()}

                {error && (
                    <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200" dir={i18n.dir()}>
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <AlertTitle className="text-red-800">{t('common.error')}</AlertTitle>
                        <AlertDescription className="text-red-700">{error.includes("expired code") ? t('common.invalid_code') : error.includes("User not found") ? t('invoicing.error_no_user') : error}</AlertDescription>
                    </Alert>
                )}

                {stage === 'request' && (
                    <form onSubmit={handleRequestReset} className="space-y-6" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="email" className="ps-1 font-semibold text-neutral/80">{t('forgot_password.email')}</Label>
                            <div className="relative">
                                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@company.com"
                                    required
                                    className="ps-10 h-12 rounded-xl border-neutral/20 focus:ring-primary/20"
                                />
                            </div>
                            {!isEmailValid && email.length > 0 && (
                            <p className="text-red-500 text-sm mt-1">{t('login.validateEmail', 'Please enter a valid email address.')}</p>
                            )}
                        </div>
                        <Button type="submit" className="w-full h-12 rounded-xl text-lg font-bold" disabled={isLoading || !isEmailValid}>
                            {isLoading ? <Spinner /> : t('forgot_password.send_code')}
                        </Button>
                    </form>
                )}

                {stage === 'verify' && (
                    <form onSubmit={handleVerifyCode} className="space-y-6" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="code" className="ps-1 font-semibold text-neutral/80">{t('forgot_password.verification_code')}</Label>
                            <div className="relative">
                                <Key className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                <Input
                                    id="code"
                                    type="text"
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="000000"
                                    required
                                    className="ps-10 h-12 rounded-xl border-neutral/20 text-center text-2xl tracking-widest font-bold"
                                />
                                {!isEmailValid && email.length > 0 && (
                <p className="text-red-500 text-sm mt-1">{t('login.validateEmail', 'Please enter a valid email address.')}</p>
              )}
                            </div>
                            {timeLeft > 0 && (
                                <p className="text-center text-sm text-neutral/40 mt-2">
                                    {t('forgot_password.expires_in')}: <span className="font-mono font-bold text-primary">{formatTime(timeLeft)}</span>
                                </p>
                            )}
                            {timeLeft === 0 && (
                                <button
                                    type="button"
                                    onClick={handleRequestReset}
                                    className="w-full text-center text-sm text-primary hover:underline mt-2 font-medium"
                                >
                                    {t('forgot_password.resend_code')}
                                </button>
                            )}
                        </div>
                        <Button type="submit" className="w-full h-12 rounded-xl text-lg font-bold" disabled={isLoading || code.length !== 6}>
                            {isLoading ? <Spinner /> : t('forgot_password.verify')}
                        </Button>
                    </form>
                )}

                {stage === 'reset' && (
                    <form onSubmit={handleResetPassword} className="space-y-6" noValidate>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="newPassword" title='at least 6 characters' className="ps-1 font-semibold text-neutral/80">{t('forgot_password.new_password')}</Label>
                                <div className="relative">
                                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                    <Input
                                        id="newPassword"
                                        type={showPassword ? "text" : "password"}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="ps-10 h-12 rounded-xl border-neutral/20"
                                    />
                                    {/* Toggle Visibility Button - positioned at the end */}
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                                            >
                                            {showPassword ? (
                                                <img src="/eva-icons/fill/png/128/eye.png" alt="Hide" className="w-6 h-6 opacity-70" />
                                            ) : (
                                                <img src="/eva-icons/fill/png/128/eye-off.png" alt="Show" className="w-6 h-6 opacity-70" />
                                            )}
                                        </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="ps-1 font-semibold text-neutral/80">{t('forgot_password.confirm_password')}</Label>
                                <div className="relative">
                                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral/30" />
                                    <Input
                                        id="confirmPassword"
                                        type={showPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="ps-10 h-12 rounded-xl border-neutral/20"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute end-0 top-0 h-full px-4 flex items-center justify-center text-neutral/40 hover:text-primary outline-none"
                                        >
                                        {showPassword ? (
                                            <img src="/eva-icons/fill/png/128/eye.png" alt="Hide" className="w-6 h-6 opacity-70" />
                                        ) : (
                                            <img src="/eva-icons/fill/png/128/eye-off.png" alt="Show" className="w-6 h-6 opacity-70" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <Button type="submit" className="w-full h-12 rounded-xl text-lg font-bold" disabled={isLoading || error != null}>
                            {isLoading ? <Spinner /> : t('forgot_password.reset_button')}
                        </Button>
                    </form>
                )}

                {stage === 'success' && (
                    <div className="text-center space-y-8">
                        <div className="flex justify-center">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300">
                                <CheckCircle2 className="w-12 h-12" />
                            </div>
                        </div>
                        <Button onClick={() => navigate('/')} className="w-full h-12 rounded-xl text-lg font-bold">
                            {t('forgot_password.back_login')}
                        </Button>
                    </div>
                )}

                {stage !== 'success' && (
                    <div className="mt-8 text-center">
                        <p className="text-neutral/40 text-sm">
                            {t('forgot_password.remembered')}{' '}
                            <Link to="/" className="text-primary font-bold hover:underline">
                                {t('forgot_password.login_link')}
                            </Link>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

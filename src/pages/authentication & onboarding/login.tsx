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
import { useAuthenticationStore } from "@/store/useAuthenticationStore";
import { useUserStore } from "@/store/useUserStore";
import api from '@/api/client';
import { LoginResponse } from '@/store/useAuthenticationStore';

// Note: Ensure you place actual svg files in your /public/assets/ folder
// placeholders used here: globe.svg, eye.svg, eye-slash.svg, logo-ssc.svg

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(true);

  const { setCurrentUser, currentUser } = useUserStore();
  const { setCurrentAuthentication, currentAuthentication } = useAuthenticationStore();


  // Set default email value if available and not logged in
  useEffect(() => {
    // Only pre-fill if not logged in and a previous user's email is available
    if (!currentAuthentication?.is_logged_in && currentUser?.email) {
      setEmail(currentUser.email);
      setIsEmailValid(EMAIL_REGEX.test(currentUser.email)); // Validate pre-filled email
    }
  }, [currentAuthentication, currentUser]);


  const toggleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); // Clear previous errors

    if (!EMAIL_REGEX.test(email)) {
        setIsEmailValid(false);
        setError("");
        return;
    }

    try {
      const response = await api.post<LoginResponse>('/authentications/login', { "email": email, "password": password });
      
      const { user, authentication } = response.data;

      // Update Zustand stores
      setCurrentUser(user);
      setCurrentAuthentication(authentication);
      
      if (user?.role === "employee") {
        navigate("/chagne_password")
      }
      // Redirect to dashboard
      navigate("/dashboard");

    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError("An unexpected error occurred during login.");
      }
    }
  };

  return (
    // Main Container - Stacks vertically on small screens, side-by-side on desktop (md:)
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[var(--color-bg)] overflow-hidden">
      
      {/* --- LEFT PANEL (1/3 width) --- */}
      <div className="w-full md:w-1/3 bg-primary text-white p-8 flex flex-col justify-between relative overflow-hidden">
        
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

        {/* Middle: Banner Text */}
        <div className="my-12 md:my-0 relative z-10">
          <h2 className="text-4xl font-bold mb-6 leading-tight text-white">
            {t('login.banner.title', "Let's get started")}
          </h2>
          {/* Lorem Ipsum placeholder */}
          <p className="text-white/60 text-base leading-relaxed max-w-sm">
            {t('login.welcome', "Welcome to our platform powered by Sudan’s resilience and inspired by its sun. Built to turn energy into impact and ideas into action.")}
          </p>
        </div>

        {/* Bottom: Footer links */}
        <div className="flex items-center justify-between text-sm font-medium relative z-10 pt-6 border-t border-white/30">
          <button type="button" className="hover:text-primary-lighter transition-colors hover:underline"
            onClick={() => {
              navigate("/register")
            }}
          >
            {t('login.create_account_link', "Create a new account")}
          </button>
          <button type="button" className="hover:text-primary-lighter transition-colors hover:underline"
            onClick={() => {
              navigate("/help")
            }}
          >
            {t('login.need_help', "Need Help?")}</button>
        </div>
      </div>


      {/* --- RIGHT PANEL (2/3 width) --- */}
      <div className="w-full md:w-2/3 bg-[var(--color-bg)] p-8 md:p-12 relative flex items-center justify-center">
        
        {/* Language Switcher - Absolute Top End Corner */}
        <div className="absolute top-6 end-6 flex items-center gap-3 bg-[var(--color-bg)] ps-3 pe-2 py-1.5 transition-all hover:border-primary/30 font-medium text-sm text-neutral/80">
          {/* Placeholder for local globe icon */}
          <Select value={i18n.language} onValueChange={toggleLanguage}>
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

        {/* Login Form Container */}
        <div className="w-full max-w-md space-y-8">
          <div className="text-center md:text-start">
            <h1 className="text-3xl font-bold text-neutral">{t('login.form_title', 'Welcome Back')}</h1>
            <p className="text-neutral/60 mt-2">{t('login.form_subtitle', 'Please enter your details to sign in.')}</p>
          </div>

          <form className="space-y-5" onSubmit={handleLogin} noValidate>
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-neutral/80 ps-1">
                {t('login.email_label', 'Email Address')}
              </label>
              <input 
                type="email" 
                placeholder="name@example.com"
                className={`w-full px-4 py-3 border border-neutral/20 rounded-base outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40
                          ${!isEmailValid ? 'ring-red-500 ring-2' : 'focus:border-primary focus:ring-2 focus:ring-primary/20'}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setIsEmailValid(EMAIL_REGEX.test(e.target.value));
                }}
              />
              {!isEmailValid && email.length > 0 && (
                <p className="text-red-500 text-sm mt-1">{t('login.validateEmail', 'Please enter a valid email address.')}</p>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-neutral/80 ps-1">
                 {t('login.password_label', 'Password')}
              </label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••"
                  // pe-12 adds padding to the end to make room for the button
                  className="w-full ps-4 pe-12 py-3 border border-neutral/20 rounded-base focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-neutral-bg/30 hover:border-neutral/40 placeholder:text-neutral/40"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {/* Toggle Visibility Button - positioned at the end */}
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

              {/* Forgot Password Link */}
            <Link to='/forgotpassword' className="text-center mt-5 pl-2 ">
              <button type="button" className="text-primary font-semibold hover:underline text-sm">
                {t('login.forgot_password', 'Forgot password?')}
              </button>
            </Link>
            </div>

            

            {/* Login Button */}
            <button type="submit" className="w-full bg-primary text-white py-3.5 rounded-base font-bold text-lg shadow-sm hover:bg-primary/90 hover:shadow-md transition-all active:scale-[0.99] mt-4">
              {t('login.submit_button', 'Login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
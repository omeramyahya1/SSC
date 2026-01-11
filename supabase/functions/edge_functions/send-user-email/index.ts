// supabase/functions/send-user-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

// 1. Define Types
interface TemplateContent {
  subject: string;
  body: (payload: any, lang: "en" | "ar", date: string) => string;
}

interface Templates {
  [key: string]: {
    en: TemplateContent;
    ar: TemplateContent;
  };
}

const emailWrapper = (
  title: string,
  content: string,
  date: string,
  lang: "en" | "ar" = "en",
) => {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const textAlign = lang === "ar" ? "right" : "left";
  const footerText = "© 2026 Solar System Calculator. All rights reserved.";
  const appName = "Solar System Calculator";
  const formattedDate = new Date(date).toLocaleString(
    lang === "ar" ? "ar-EG" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );

  return `
<div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; box-sizing: border-box; background-color: #ffffff; color: #333; line-height: 1.6; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;" dir="${dir}">
  <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 20px;">
    <h1 style="margin: 0; color: #0056b3; font-size: 24px;">${appName}</h1>
    <p style="margin: 5px 0 0; color: #777; font-size: 14px;">${formattedDate}</p>
  </div>
  <div style="padding: 0 20px; text-align: ${textAlign};">
    <h2 style="color: #333; font-size: 20px; margin-top: 0;">${title}</h2>
    ${content}
  </div>
  <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #777;">
    <p style="margin:0;">${footerText}</p>
  </div>
</div>
  `;
};

// 2. Define Templates
const templates: Templates = {
  payment_approved: {
    en: {
      subject: "Payment Successful",
      body: (p, lang, date) =>
        emailWrapper(
          "Payment Successful",
          `<p>Hello ${p.username || "User"},</p>
         <p>Your payment has been successfully processed and your subscription is now active.</p>
         <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">Payment Details</h3>
         <p><strong>Subscription:</strong> ${p.subscription_type}</p>
         <p><strong>Amount:</strong> ${p.amount}</p>
         <p><strong>Method:</strong> ${p.method}</p>
         <p><strong>Status:</strong> <span style="color:green;font-weight:bold;">${
            p.status
          }</span></p>
         <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">Your License</h3>
         <p>Please use the following code to activate your software:</p>
         <p style="background-color: #f0f0f0; border: 1px solid #ccc; padding: 10px; border-radius: 4px; font-family: monospace; text-align: center; font-size: 16px;">${
            p.license_code || "N/A"
          }</p>
         <p>Thank you for using our service!</p>`,
          date,
          lang,
        ),
    },
    ar: {
      subject: "تم الدفع بنجاح",
      body: (p, lang, date) =>
        emailWrapper(
          "تم الدفع بنجاح",
          `<p>مرحباً ${p.username || "مستخدم"},</p>
         <p>لقد تم استلام دفعتك بنجاح واشتراكك مفعل الآن.</p>
         <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">تفاصيل الدفع</h3>
         <p><strong>الاشتراك:</strong> ${p.subscription_type}</p>
         <p><strong>المبلغ:</strong> ${p.amount}</p>
         <p><strong>طريقة الدفع:</strong> ${p.method}</p>
         <p><strong>الحالة:</strong> <span style="color:green;font-weight:bold;">${
            p.status
          }</span></p>
        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">الترخيص الخاص بك</h3>
         <p>يرجى استخدام الرمز التالي لتفعيل البرنامج:</p>
         <p style="background-color: #f0f0f0; border: 1px solid #ccc; padding: 10px; border-radius: 4px; font-family: monospace; text-align: center; font-size: 16px; direction: ltr;">${
            p.license_code || "N/A"
          }</p>
         <p>شكراً لاستخدامك خدمتنا!</p>`,
          date,
          lang,
        ),
    },
  },
  payment_declined: {
    en: {
      subject: "Payment Failed",
      body: (p, lang, date) =>
        emailWrapper(
          "Payment Failed",
          `<p>Hello ${p.username || "User"},</p>
         <p>We're sorry, but we were unable to process your payment for the following subscription:</p>
         <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">Payment Details</h3>
         <p><strong>Subscription:</strong> ${p.subscription_type}</p>
         <p><strong>Amount:</strong> ${p.amount}</p>
         <p><strong>Method:</strong> ${p.method}</p>
         <p><strong>Status:</strong> <span style="color:red;font-weight:bold;">${
            p.status
          }</span></p>
         <p>Please check your payment details. If you continue to have issues, please open a support ticket from the 'Help' section in the application.</p>`,
          date,
          lang,
        ),
    },
    ar: {
      subject: "فشل الدفع",
      body: (p, lang, date) =>
        emailWrapper(
          "فشل الدفع",
          `<p>مرحباً ${p.username || "مستخدم"},</p>
         <p>نأسف، لم نتمكن من معالجة دفعتك للاشتراك التالي:</p>
         <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">تفاصيل الدفع</h3>
         <p><strong>الاشتراك:</strong> ${p.subscription_type}</p>
         <p><strong>المبلغ:</strong> ${p.amount}</p>
         <p><strong>طريقة الدفع:</strong> ${p.method}</p>
         <p><strong>الحالة:</strong> <span style="color:red;font-weight:bold;">${
            p.status
          }</span></p>
         <p>يرجى التحقق من تفاصيل الدفع. إذا استمرت المشكلة، يرجى فتح تذكرة دعم من قسم "المساعدة" في التطبيق.</p>`,
          date,
          lang,
        ),
    },
  },
  password_change_verification: {
    en: {
      subject: "Password verification code",
      body: (p, lang, date) =>
        emailWrapper(
          "Your Verification Code",
          `<p>Hello,</p>
         <p>You requested a password change. Use the code below to complete the process.</p>
         <p style="font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; margin: 20px 0; padding: 10px; background-color: #f2f2f2; border-radius: 5px;">${p.verification_code}</p>
         <p>This code will expire in 10 minutes. If you did not request this, you can safely ignore this email.</p>`,
          date,
          lang,
        ),
    },
    ar: {
      subject: "رمز تغيير كلمة المرور",
      body: (p, lang, date) =>
        emailWrapper(
          "رمز التحقق الخاص بك",
          `<p>مرحباً،</p>
         <p>لقد طلبت تغيير كلمة المرور. استخدم الرمز أدناه لإكمال العملية.</p>
         <p style="font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; margin: 20px 0; padding: 10px; background-color: #f2f2f2; border-radius: 5px; direction: ltr;">${p.verification_code}</p>
         <p>هذا الرمز صالح لمدة 10 دقائق. إذا لم تكن أنت من طلب هذا، يمكنك تجاهل هذا البريد الإلكتروني بأمان.</p>`,
          date,
          lang,
        ),
    },
  },
  new_device_login: {
    en: {
      subject: "New device login",
      body: (_, lang, date) =>
        emailWrapper(
          "Security Alert: New Device Login",
          `<p>Hello,</p>
         <p>A new device has been used to log in to your account. If this was you, you can safely ignore this email.</p>
         <p>If you do not recognize this activity, we strongly recommend changing your password immediately to secure your account.</p>`,
          date,
          lang,
        ),
    },
    ar: {
      subject: "تسجيل دخول من جهاز جديد",
      body: (_, lang, date) =>
        emailWrapper(
          "تنبيه أمني: تسجيل دخول من جهاز جديد",
          `<p>مرحباً،</p>
         <p>تم استخدام جهاز جديد لتسجيل الدخول إلى حسابك. إذا كنت أنت من قام بذلك، يمكنك تجاهل هذا البريد الإلكتروني بأمان.</p>
         <p>إذا لم تتعرف على هذا النشاط، نوصي بشدة بتغيير كلمة المرور الخاصة بك على الفور لتأمين حسابك.</p>`,
          date,
          lang,
        ),
    },
  },
};

serve(async (req) => {
  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
  const SENDER_EMAIL = "omeramyahya001@gmail.com"; 

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch Pending Jobs
  const { data: jobs, error: fetchError } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .eq("recipient_role", "user");

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  for (const job of jobs ?? []) {
    try {
      // Fetch User & Settings
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select(`
          email,
          application_settings!user_id (
            language
          )
        `)
        .eq("id", job.recipient_user_id)
        .single();

      if (userError || !userData) {
        throw new Error(`User not found or settings missing: ${userError?.message}`);
      }

      // Determine Language
      const settings = Array.isArray(userData.application_settings) 
        ? userData.application_settings[0] 
        : userData.application_settings;
        
      const lang = (settings?.language as "en" | "ar") || "en";

      // Select Template
      const templateGroup = templates[job.event_type];
      if (!templateGroup) {
        throw new Error(`Template not found for event type: ${job.event_type}`);
      }
      
      const tpl = templateGroup[lang] || templateGroup['en'];

      // Prepare Brevo Payload
      const emailData = {
        sender: { name: "SSC", email: SENDER_EMAIL },
        to: [{ email: userData.email, name: "User" }],
        subject: tpl.subject,
        htmlContent: `<html><body>${tpl.body(job.payload, lang, job.created_at)}</body></html>`
      };

      // Send via Brevo API
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": BREVO_API_KEY || "",
          "content-type": "application/json",
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Brevo API Error: ${errText}`);
      }

      // Update Job Status: Sent
      await supabase.from("notification_jobs").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", job.id);

    } catch (e: any) {
      console.error(`Failed job ${job.id}:`, e);
      // Update Job Status: Failed
      await supabase.from("notification_jobs").update({
        status: "failed",
        error_message: e.message || String(e),
      }).eq("id", job.id);
    }
  }

  return new Response("OK", { 
    status: 200,
    headers: { "Content-Type": "application/json" } 
  });
});
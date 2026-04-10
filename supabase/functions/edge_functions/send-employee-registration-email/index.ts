// supabase/functions/send-employee-registration-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

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

  return `
<div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; box-sizing: border-box; background-color: #ffffff; color: #333; line-height: 1.6; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;" dir="${dir}">
  <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 20px;">
    <h1 style="margin: 0; color: #0056b3; font-size: 24px;">${appName}</h1>
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

const templates = {
  employee_registration: {
    en: {
      subject: "Welcome to the Team - Your Account is Ready",
      body: (p: any, date: string) =>
        emailWrapper(
          "Welcome to the Team!",
          `<p>Hello ${p.username},</p>
         <p>An account has been created for you at <strong>${p.org_name}</strong>.</p>
         <p>You can now log in to the Solar System Calculator using the following credentials:</p>
         <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #eee;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${p.username}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="font-size: 18px; font-weight: bold; color: #0056b3;">${p.temp_password}</span></p>
         </div>
         <p>For security reasons, we recommend changing your password after your first login.</p>
         <p>Welcome aboard!</p>`,
          date,
          "en",
        ),
    },
    ar: {
      subject: "مرحباً بك في الفريق - حسابك جاهز الآن",
      body: (p: any, date: string) =>
        emailWrapper(
          "مرحباً بك في الفريق!",
          `<p>مرحباً ${p.username}،</p>
         <p>تم إنشاء حساب لك في <strong>${p.org_name}</strong>.</p>
         <p>يمكنك الآن تسجيل الدخول إلى تطبيق Solar System Calculator باستخدام البيانات التالية:</p>
         <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #eee; direction: ltr; text-align: left;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${p.username}</p>
            <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="font-size: 18px; font-weight: bold; color: #0056b3;">${p.temp_password}</span></p>
         </div>
         <p>لأسباب أمنية، نوصي بتغيير كلمة المرور الخاصة بك بعد تسجيل الدخول الأول.</p>
         <p>أهلاً بك معنا!</p>`,
          date,
          "ar",
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

  // Fetch Pending Registration Jobs
  const { data: pendingJobs, error: fetchError } = await supabase
    .from("notification_jobs")
    .select("id, recipient_user_id, payload, created_at")
    .eq("status", "pending")
    .eq("event_type", "employee_registration");

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const pendingIds = (pendingJobs ?? []).map((j) => j.id);
  if (pendingIds.length === 0) {
    return new Response("OK", { status: 200 });
  }

  // Atomically claim jobs to avoid double processing
  const { data: claimedJobs, error: claimError } = await supabase
    .from("notification_jobs")
    .update({ status: "processing" })
    .in("id", pendingIds)
    .eq("status", "pending")
    .select("id, recipient_user_id, payload, created_at");

  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 });
  }

  for (const job of claimedJobs ?? []) {
    try {
      // Fetch User & Settings to determine language
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
        throw new Error(`User not found: ${userError?.message}`);
      }

      const settings = Array.isArray(userData.application_settings)
        ? userData.application_settings[0]
        : userData.application_settings;

      const lang = (settings?.language as "en" | "ar") || "en";
      const tpl = templates.employee_registration[lang] || templates.employee_registration['en'];

      // Send via Brevo
      const emailData = {
        sender: { name: "SSC", email: SENDER_EMAIL },
        to: [{ email: userData.email, name: job.payload.username }],
        subject: tpl.subject,
        htmlContent: `<html><body>${tpl.body(job.payload, job.created_at)}</body></html>`
      };

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
        throw new Error(`Brevo API Error: ${await response.text()}`);
      }

      // Update Job Status
      await supabase.from("notification_jobs").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", job.id);

    } catch (e: any) {
      console.error(`Failed job ${job.id}:`, e);
      await supabase.from("notification_jobs").update({
        status: "failed",
        error: e.message || String(e),
      }).eq("id", job.id);
    }
  }

  return new Response("OK", { status: 200 });
});

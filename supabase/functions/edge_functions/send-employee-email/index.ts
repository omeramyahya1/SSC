// supabase/functions/send-employee-email/index.ts
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
  const footerText = "© 2026 SSC. All rights reserved.";
  const appName = "SSC";

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

const templates: any = {
  employee_branch_change: {
    en: {
      subject: "Branch Assignment Update",
      body: (p: any, date: string) =>
        emailWrapper(
          "Branch Assignment Update",
          `<p>Hello ${p.username},</p>
         <p>Your branch assignment at <strong>${p.org_name}</strong> has been updated.</p>
         <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #eee;">
            <p style="margin: 5px 0;"><strong>Previous Branch:</strong> ${p.old_branch_name}</p>
            <p style="margin: 5px 0;"><strong>New Branch:</strong> <span style="font-size: 18px; font-weight: bold; color: #0056b3;">${p.new_branch_name}</span></p>
         </div>
         <p>Please log in to see your updated branch information.</p>`,
          date,
          "en",
        ),
    },
    ar: {
      subject: "تغيير الفرع",
      body: (p: any, date: string) =>
        emailWrapper(
          "تغيير الفرع",
          `<p>مرحباً ${p.username}،</p>
         <p>تم تغيير الفرع الخاص بك في <strong>${p.org_name}</strong>.</p>
         <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #eee; direction: rtl; text-align: right;">
            <p style="margin: 5px 0;"><strong>الفرع السابق:</strong> ${p.old_branch_name}</p>
            <p style="margin: 5px 0;"><strong>الفرع الجديد:</strong> <span style="font-size: 18px; font-weight: bold; color: #0056b3;">${p.new_branch_name}</span></p>
         </div>
         <p>يرجى تسجيل الدخول لمشاهدة معلومات الفرع المحدثة الخاصة بك.</p>`,
          date,
          "ar",
        ),
    },
  },
};

serve(async (req) => {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch Pending Branch Change Jobs
  const { data: pendingJobs, error: fetchError } = await supabase
    .from("notification_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("event_type", "employee_branch_change");

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
    });
  }

  const pendingIds = (pendingJobs ?? []).map((j) => j.id);
  if (pendingIds.length === 0) {
    return new Response("OK", { status: 200 });
  }

  // Atomically claim jobs
  const { data: claimedJobs, error: claimError } = await supabase
    .from("notification_jobs")
    .update({ status: "processing" })
    .in("id", pendingIds)
    .eq("status", "pending")
    .select("id, recipient_user_id, payload, created_at");

  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), {
      status: 500,
    });
  }

  for (const job of claimedJobs ?? []) {
    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select(`email`)
        .eq("id", job.recipient_user_id)
        .single();

      if (userError || !userData) {
        throw new Error(`User not found: ${userError?.message}`);
      }

      const lang = "ar"; // consistent with registration
      const tpl =
        templates.employee_branch_change[lang] ||
        templates.employee_branch_change["en"];

      const emailData = {
        sender: { name: "SSC", email: SENDER_EMAIL },
        to: [{ email: userData.email, name: job.payload.username }],
        subject: tpl.subject,
        htmlContent: `<html><body>${tpl.body(job.payload, job.created_at)}</body></html>`,
      };

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": BREVO_API_KEY || "",
          "content-type": "application/json",
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        throw new Error(`Brevo API Error: ${await response.text()}`);
      }

      await supabase
        .from("notification_jobs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } catch (e: any) {
      console.error(`Failed job ${job.id}:`, e);
      await supabase
        .from("notification_jobs")
        .update({
          status: "failed",
          error: e.message || String(e),
        })
        .eq("id", job.id);
    }
  }

  return new Response("OK", { status: 200 });
});

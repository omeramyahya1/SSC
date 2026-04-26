// supabase/functions/send-distributor-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

// 1. Define Types
interface TemplateContent {
  subject: string;
  body: (payload: any, date: string) => string;
}

interface Templates {
  [key: string]: {
    ar: TemplateContent;
    en?: TemplateContent; // Distributor emails are primarily in Arabic
  };
}

const emailWrapper = (
  title: string,
  content: string,
  date: string,
  lang: "ar" | "en" = "ar",
) => {
  const appName = "SSC";
  const dir = lang === "ar" ? "rtl" : "ltr";
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
  <div style="padding: 0 20px; text-align: ${lang === "ar" ? "right" : "left"};">
    <h2 style="color: #333; font-size: 20px; margin-top: 0;">${title}</h2>
    ${content}
  </div>
  <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #777;">
    <p style="margin:0;">© 2026 Solar System Calculator. All rights reserved.</p>
  </div>
</div>
  `;
};

const templates: Templates = {
  account_deactivated_distributor: {
    ar: {
      subject: "إشعار: إلغاء تفعيل حساب مستخدم",
      body: (p, date) =>
        emailWrapper(
          "إشعار: إلغاء تفعيل حساب مستخدم",
          `<p>مرحباً ${p.distributor_name || "الموزع"},</p>
          <p>نود إعلامك بأنه تم إلغاء تفعيل حساب المستخدم <strong>${p.deactivated_username || "N/A"}</strong> (معرف المستخدم: ${p.deactivated_user_id || "N/A"}), والذي كان مرتبطًا بك.</p>
          <p>نوع الحساب: ${p.deactivated_account_type || "N/A"}.</p>
          <p>يرجى العلم بهذا التغيير في حالة تأثره على حسابات العمولات الخاصة بك.</p>
          `,
          date,
          "ar"
        ),
    },
  },
};

serve(async (_req) => {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");

  if (!BREVO_API_KEY || !SENDER_EMAIL) {
    return new Response(
      JSON.stringify({ error: "Missing BREVO_API_KEY or SENDER_EMAIL env var" }),
      { status: 500 },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Fetch all pending distributor jobs
  const { data: jobs, error: fetchError } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .eq("recipient_role", "distributor");

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
    });
  }

  if (!jobs || jobs.length === 0) {
    return new Response(JSON.stringify({ message: "No pending jobs" }), {
      status: 200,
    });
  }

  // 2. Group jobs by Distributor ID
  const jobsByDistributor = jobs.reduce((acc: any, job) => {
    const distId = job.recipient_user_id;
    if (!acc[distId]) {
      acc[distId] = [];
    }
    acc[distId].push(job);
    return acc;
  }, {});

  // 3. Process each distributor group independently
  for (const distId of Object.keys(jobsByDistributor)) {
    const distributorJobs = jobsByDistributor[distId];

    try {
      // Fetch Distributor Email
      const { data: distributor, error: distError } = await supabase
        .from("distributors")
        .select("email")
        .eq("id", distId)
        .single();

      if (distError || !distributor) {
        throw new Error(`Distributor email not found for ID: ${distId}`);
      }

      // Separate deactivation jobs from other types
      const deactivationJobs = distributorJobs.filter((job: any) => job.event_type === 'account_deactivated_distributor');
      const otherDistributorJobs = distributorJobs.filter((job: any) => job.event_type !== 'account_deactivated_distributor');

      // Process deactivation jobs individually
      for (const job of deactivationJobs) {
        const lang = "ar"; // Distributor emails are primarily in Arabic
        const tpl = templates['account_deactivated_distributor'][lang];
        if (!tpl) {
          throw new Error(`Template not found for event type: ${job.event_type} and lang: ${lang}`);
        }

        const emailData = {
          sender: { name: "SSC", email: SENDER_EMAIL },
          to: [{ email: distributor.email, name: "Distributor" }],
          subject: tpl.subject,
          htmlContent: `<html><body>${tpl.body(job.payload, job.created_at)}</body></html>`,
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
          const errText = await response.text();
          throw new Error(`Brevo API Error for job ${job.id}: ${errText}`);
        }

        await supabase.from("notification_jobs").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).eq("id", job.id);
      }

      // Continue with summary report for other distributor jobs
      if (otherDistributorJobs.length > 0) {
        // Build HTML Table Rows
        const tableRows = otherDistributorJobs.map((job: any) => {
          const p = job.payload || {};
          const date = new Date(job.created_at).toLocaleDateString("ar-EG");

          // Status Styling
          let statusLabel = p.status;
          if (p.status === "approved") {
            statusLabel =
              '<span style="color:green; font-weight:bold;">مقبول</span>';
          } else if (p.status === "declined") {
            statusLabel =
              '<span style="color:red; font-weight:bold;">مرفوض</span>';
          }

          return `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${date}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${
            p.user_name || "-"
          }</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${
            p.subscription_type || "-"
          }</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${
            p.amount || "-"
          }</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${
            p.method || "-"
          }</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${statusLabel}</td>
            </tr>
          `;
        }).join("");

        const reportContent = `
              <p>لديك <strong>${otherDistributorJobs.length}</strong> تحديثات جديدة بخصوص المستخدمين المرتبطين بك.</p>

              <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                  <tr style="background-color: #f2f2f2;">
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">التاريخ</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">اسم المستخدم</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">نوع الاشتراك</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">المبلغ</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">الطريقة</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: right;">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
        `;

        // Build Complete HTML (RTL for Arabic)
        const emailHtml = emailWrapper(
          "ملخص الإشعارات الجديد",
          reportContent,
          new Date().toISOString(),
        );

        // Send ONE Email for this Distributor
        const emailData = {
          sender: { name: "SSC", email: SENDER_EMAIL },
          to: [{ email: distributor.email, name: "Distributor" }],
          subject: `تحديثات جديدة: ${otherDistributorJobs.length} إشعار`,
          htmlContent: `<html><body>${emailHtml}</body></html>`,
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
          const errText = await response.text();
          throw new Error(`Brevo API Error: ${errText}`);
        }

        // Success: Mark ALL other jobs in this specific group as sent
        const otherJobIds = otherDistributorJobs.map((j: any) => j.id);
        await supabase.from("notification_jobs").update({
          status: "sent",
          sent_at: new Date().toISOString(),
        }).in("id", otherJobIds);
      }
    } catch (e: any) {
      console.error(`Failed batch for distributor ${distId}:`, e);

      const jobIds = distributorJobs.map((j: any) => j.id);
      await supabase.from("notification_jobs").update({
        status: "failed",
        error: e.message || String(e),
      }).in("id", jobIds);
    }
  }
  // The final response needs to summarize all processing.
  return new Response(
    JSON.stringify({
      success: true,
      groupsProcessed: Object.keys(jobsByDistributor).length,
      // Consider adding total successes/failures for better reporting
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});

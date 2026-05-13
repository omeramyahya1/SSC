// supabase/functions/send-admin-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

// 1. Define Types
interface TemplateContent {
  subject: string;
  body: (payload: any, date: string) => string;
}

interface Templates {
  [key: string]: {
    en: TemplateContent;
    ar?: TemplateContent; // Optional Arabic for superadmin, based on current pattern
  };
}

const emailWrapper = (
  title: string,
  content: string,
  date: string,
  lang: "en" | "ar" = "en",
) => {
  const appName = "Solar System Calculator";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const textAlign = lang === "ar" ? "right" : "left";
  const formattedDate = new Date(date).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

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
    <p style="margin:0;">&copy; 2026 Solar System Calculator. All rights reserved.</p>
  </div>
</div>
  `;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]!));

  serve(async (_req) => {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");
  const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

const templates: Templates = {
  account_deactivated_superadmin: {
    en: {
      subject: "User Account Deactivated - SSC Notification",
      body: (p, date) => {
        const username = escapeHtml(p.deactivated_username || "N/A");
        const userId = escapeHtml(p.deactivated_user_id || "N/A");
        const accountType = escapeHtml(p.account_type || "N/A");
        const role = escapeHtml(p.role || "N/A");
        const orgName = escapeHtml(p.organization_name || "N/A");
        const deactivatedByAdmin = p.deactivated_by_admin ? "by an admin" : "by themselves";
        const email = escapeHtml(p.deactivated_user_email || "N/A");

        return emailWrapper(
          "User Account Deactivated",
          `
          <p>Hello Super Admin,</p>
          <p>A user account has been deactivated in the Solar System Calculator.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px;">
            <tr style="background-color: #f2f2f2; text-align: left;">
              <th style="padding: 8px; border: 1px solid #ddd;">Detail</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Value</th>
            </tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">Username</td><td style="padding: 8px; border: 1px solid #ddd;">${username}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">User Email</td><td style="padding: 8px; border: 1px solid #ddd;">${email}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">User ID</td><td style="padding: 8px; border: 1px solid #ddd;">${userId}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">Account Type</td><td style="padding: 8px; border: 1px solid #ddd;">${accountType}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">Role</td><td style="padding: 8px; border: 1px solid #ddd;">${role}</td></tr>
            ${p.organization_id ? `<tr><td style="padding: 8px; border: 1px solid #ddd;">Organization</td><td style="padding: 8px; border: 1px solid #ddd;">${orgName} (ID: ${p.organization_id})</td></tr>` : ''}
            <tr><td style="padding: 8px; border: 1px solid #ddd;">Deactivated By</td><td style="padding: 8px; border: 1px solid #ddd;">${deactivatedByAdmin}</td></tr>
          </table>
          <p>Please review the details above.</p>
          `,
          date,
          "en"
        );
      },
    },
    ar: {
      subject: "تم إلغاء تفعيل حساب المستخدم - إشعار SSC",
      body: (p, date) => {
        const username = escapeHtml(p.deactivated_username || "N/A");
        const userId = escapeHtml(p.deactivated_user_id || "N/A");
        const accountType = escapeHtml(p.account_type || "N/A");
        const role = escapeHtml(p.role || "N/A");
        const orgName = escapeHtml(p.organization_name || "N/A");
        const deactivatedByAdmin = p.deactivated_by_admin ? "بواسطة مسؤول" : "بواسطة المستخدم نفسه";
        const email = escapeHtml(p.deactivated_user_email || "N/A");

        return emailWrapper(
          "تم إلغاء تفعيل حساب المستخدم",
          `
          <p>مرحباً مشرف النظام،</p>
          <p>تم إلغاء تفعيل حساب مستخدم في حاسبة النظام الشمسي.</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px;" dir="rtl">
            <tr style="background-color: #f2f2f2; text-align: right;">
              <th style="padding: 8px; border: 1px solid #ddd;">التفاصيل</th>
              <th style="padding: 8px; border: 1px solid #ddd;">القيمة</th>
            </tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">اسم المستخدم</td><td style="padding: 8px; border: 1px solid #ddd;">${username}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">بريد المستخدم</td><td style="padding: 8px; border: 1px solid #ddd;">${email}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">معرف المستخدم</td><td style="padding: 8px; border: 1px solid #ddd;">${userId}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">نوع الحساب</td><td style="padding: 8px; border: 1px solid #ddd;">${accountType}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #ddd;">الدور</td><td style="padding: 8px; border: 1px solid #ddd;">${role}</td></tr>
            ${p.organization_id ? `<tr><td style="padding: 8px; border: 1px solid #ddd;">المنظمة</td><td style="padding: 8px; border: 1px solid #ddd;">${orgName} (ID: ${p.organization_id})</td></tr>` : ''}
            <tr><td style="padding: 8px; border: 1px solid #ddd;">تم إلغاء التفعيل بواسطة</td><td style="padding: 8px; border: 1px solid #ddd;">${deactivatedByAdmin}</td></tr>
          </table>
          <p>يرجى مراجعة التفاصيل أعلاه.</p>
          `,
          date,
          "ar"
        );
      },
    },
  },
};

  // 1. Fetch all pending superadmin jobs
  const { data: allJobs, error } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .eq("recipient_role", "superadmin");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  if (!allJobs || allJobs.length === 0) {
    return new Response(JSON.stringify({ message: "No pending jobs" }), {
      status: 200,
    });
  }

  const sentJobIds: string[] = [];
  try {
    // 2. Group jobs by event type
    const registrationJobs = allJobs.filter(j => j.event_type !== 'license_tamper_detected_admin' && j.event_type !== 'support_ticket_submitted' && j.event_type !== 'account_deactivated_superadmin' && j.event_type !== 'tier2_sales_request');
    const tamperJobs = allJobs.filter(j => j.event_type === 'license_tamper_detected_admin');
    const ticketJobs = allJobs.filter(j => j.event_type === 'support_ticket_submitted');
    const salesJobs = allJobs.filter(j => j.event_type === 'tier2_sales_request');
    const deactivatedJobs = allJobs.filter(j => j.event_type === 'account_deactivated_superadmin');

    let reportContent = "";
    const summaryJobs = [...registrationJobs, ...tamperJobs, ...ticketJobs, ...salesJobs];
    const summaryJobIds = summaryJobs.map((j) => j.id);

    // Process Super Admin Deactivation Jobs Individually
    for (const job of deactivatedJobs) {
      try {
        const lang = "en"; // Super Admin notifications typically English
        const tpl = templates['account_deactivated_superadmin'][lang];
        if (!tpl) {
          throw new Error(`Template not found for event type: ${job.event_type} and lang: ${lang}`);
        }

        const emailData = {
          sender: { name: "SSC", email: SENDER_EMAIL },
          to: [{ email: ADMIN_EMAIL, name: "Super Admin" }],
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

      } catch (e: any) {
        console.error(`Failed to send email for job ${job.id}:`, e);
        await supabase.from("notification_jobs").update({
          status: "failed",
          error: e.message || String(e),
        }).eq("id", job.id);
      }
    }

    // 3. Build content for Support Tickets
    if (ticketJobs.length > 0) {
      const ticketRows = ticketJobs.map((job) => {
        const p = job.payload || {};
        const date = escapeHtml(new Date(job.created_at).toLocaleString("en-US"));
       const username = escapeHtml(p.username || "N/A");
        const userEmail = escapeHtml(p.user_email || "N/A");
        const businessName = escapeHtml(p.business_name || "");
        const subject = escapeHtml(p.subject || "No Subject");
        const body = escapeHtml(p.body || "");
        return `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              <strong>${username}</strong><br/>
              <small>${userEmail}</small><br/>
              <small>${businessName}</small>
            </td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              <strong>${p.subject || "No Subject"}</strong><br/>
              <p style="margin: 5px 0 0; font-size: 13px; color: #555;">${p.body}</p>
            </td>
          </tr>
        `;
      }).join("");

      reportContent += `
        <h3 style="color: #2980b9;">New Support Tickets</h3>
        <p>You have <strong>${ticketJobs.length}</strong> new support ticket(s).</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; width: 20%;">Date</th>
              <th style="padding: 10px; border: 1px solid #ddd; width: 30%;">User</th>
              <th style="padding: 10px; border: 1px solid #ddd; width: 50%;">Ticket Details</th>
            </tr>
          </thead>
          <tbody>${ticketRows}</tbody>
        </table>
      `;
    }

    // New Section for Enterprise Sales Requests
    if (salesJobs.length > 0) {
      const salesRows = salesJobs.map((job) => {
        const p = job.payload || {};
        const date = escapeHtml(new Date(job.created_at).toLocaleString("en-US"));
        return `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              <strong>${escapeHtml(p.enterprise_name)}</strong><br/>
              <small>${escapeHtml(p.email)}</small><br/>
              <small>${escapeHtml(p.phone)}</small>
            </td>
            <td style="padding: 8px; border: 1px solid #ddd;">
              <strong>${escapeHtml(p.location)}</strong><br/>
              <p style="margin: 5px 0 0; font-size: 13px; color: #555;">
                Pref: ${escapeHtml(p.meeting_preference)}<br/>
                ${escapeHtml(p.body)}
              </p>
            </td>
          </tr>
        `;
      }).join("");

      reportContent += `
        <h3 style="color: #e67e22;">New Enterprise Sales Requests</h3>
        <p>You have <strong>${salesJobs.length}</strong> new sales request(s).</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd; width: 20%;">Date</th>
              <th style="padding: 10px; border: 1px solid #ddd; width: 30%;">Enterprise</th>
              <th style="padding: 10px; border: 1px solid #ddd; width: 50%;">Request Details</th>
            </tr>
          </thead>
          <tbody>${salesRows}</tbody>
        </table>
      `;
    }

    // 4. Build content for Tamper Alerts
    if (tamperJobs.length > 0) {
      const tamperRows = tamperJobs.map((job) => {
        const p = job.payload || {};
        const date = new Date(job.created_at).toLocaleString("en-US");
        return `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.user_id || "N/A"}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.user_email || "N/A"}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.username || "N/A"}</td>
          </tr>
        `;
      }).join("");

      reportContent += `
        <h3 style="color: #c0392b;">Security Alerts: License Tampering</h3>
        <p><strong>${tamperJobs.length}</strong> account(s) have been automatically locked due to suspected license tampering.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f2f2f2; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd;">Date</th>
              <th style="padding: 10px; border: 1px solid #ddd;">User ID</th>
              <th style="padding: 10px; border: 1px solid #ddd;">User Email</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Username</th>
            </tr>
          </thead>
          <tbody>${tamperRows}</tbody>
        </table>
      `;
    }

    // 4. Build content for Registration Alerts
    if (registrationJobs.length > 0) {
      const registrationRows = registrationJobs.map((job) => {
        const p = job.payload || {};
        const date = new Date(job.created_at).toLocaleString("en-US");
        return `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.user_id || "N/A"}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.amount || "N/A"}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.payment_method || "N/A"}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${p.subscription_payment_id || "N/A"}</td>
          </tr>
        `;
      }).join("");

      reportContent += `
        <h3>New Registrations Pending Review</h3>
        <p>You have <strong>${registrationJobs.length}</strong> new registration(s) pending review.</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f2f2f2; text-align: left;">
              <th style="padding: 10px; border: 1px solid #ddd;">Date</th>
              <th style="padding: 10px; border: 1px solid #ddd;">User ID</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Amount</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Method</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Payment Ref</th>
            </tr>
          </thead>
          <tbody>${registrationRows}</tbody>
        </table>
      `;
    }

     if (summaryJobIds.length === 0) {
      return new Response(JSON.stringify({ success: true, count: deactivatedJobs.length }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const emailHtml = emailWrapper(
      "Daily Admin Summary Report",
      reportContent,
      new Date().toISOString(),
    );

    // 5. Send ONE summary email
    const emailData = {
      sender: { name: "SSC", email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL, name: "Super Admin" }],
      subject: `Admin Report: ${summaryJobIds.length} Pending Item(s)`,
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

    // 6. Batch Update: Mark only summary-related jobs as "sent"
    // Deactivation jobs were already marked individually above
    const { error: updateError } = await supabase
      .from("notification_jobs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .in("id", summaryJobIds);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, count: summaryJobIds.length + deactivatedJobs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(`Batch send failed:`, e);
    const jobIds = allJobs
      .map((j: { id: any; }) => j.id)
      .filter((id: any) => !sentJobIds.includes(id));
    await supabase.from("notification_jobs").update({
      status: "failed",
      error: e.message || String(e),
    }).in("id", jobIds);

    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

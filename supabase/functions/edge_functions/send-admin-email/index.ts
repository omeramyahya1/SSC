// supabase/functions/send-admin-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const emailWrapper = (
  title: string,
  content: string,
  date: string,
) => {
  const appName = "Solar System Calculator";
  const formattedDate = new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
<div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; box-sizing: border-box; background-color: #ffffff; color: #333; line-height: 1.6; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
  <div style="text-align: center; border-bottom: 1px solid #eee; padding-bottom: 20px; margin-bottom: 20px;">
    <h1 style="margin: 0; color: #0056b3; font-size: 24px;">${appName}</h1>
    <p style="margin: 5px 0 0; color: #777; font-size: 14px;">${formattedDate}</p>
  </div>
  <div style="padding: 0 20px; text-align: left;">
    <h2 style="color: #333; font-size: 20px; margin-top: 0;">${title}</h2>
    ${content}
  </div>
  <div style="text-align: center; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px; font-size: 12px; color: #777;">
    <p style="margin:0;">&copy; 2026 Solar System Calculator. All rights reserved.</p>
  </div>
</div>
  `;
};

serve(async (_req) => {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const SENDER_EMAIL = "omeramyahya001@gmail.com";
  const ADMIN_EMAIL = "omeramyahya@protonmail.com";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Fetch ALL pending jobs
  const { data: jobs, error } = await supabase
    .from("notification_jobs")
    .select("*")
    .eq("status", "pending")
    .eq("recipient_role", "superadmin");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  // If no jobs, exit early
  if (!jobs || jobs.length === 0) {
    return new Response(JSON.stringify({ message: "No pending jobs" }), {
      status: 200,
    });
  }

  try {
    // 2. Build the HTML Table Rows
    const tableRows = jobs.map((job) => {
      const p = job.payload || {};
      const date = new Date(job.created_at).toLocaleString("en-US");
      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${date}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${
        p.user_id || "N/A"
      }</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${
        p.amount || "N/A"
      }</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${
        p.payment_method || "N/A"
      }</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${
        p.subscription_payment_id || "N/A"
      }</td>
        </tr>
      `;
    }).join("");

    const reportContent = `
          <p>You have <strong>${jobs.length}</strong> new registration(s) pending review.</p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #f2f2f2; text-align: left;">
                <th style="padding: 10px; border: 1px solid #ddd;">Date</th>
                <th style="padding: 10px; border: 1px solid #ddd;">User ID</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Amount</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Method</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Payment Ref</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <p style="margin-top: 20px; color: #666;">
            Total records: ${jobs.length}
          </p>
    `;

    const emailHtml = emailWrapper(
      "New Registrations Report",
      reportContent,
      new Date().toISOString(),
    );

    // 3. Send ONE email with the summary
    const emailData = {
      sender: { name: "SSC", email: SENDER_EMAIL },
      to: [{ email: ADMIN_EMAIL, name: "Super Admin" }],
      subject: `New Registrations Summary (${jobs.length})`,
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

    // 4. Batch Update: Mark all these jobs as "sent"
    const jobIds = jobs.map((j) => j.id);
    const { error: updateError } = await supabase
      .from("notification_jobs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .in("id", jobIds);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, count: jobs.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(`Batch send failed:`, e);

    // Optional: Mark them as failed so they don't block future runs (or leave pending to retry)
    const jobIds = jobs.map((j) => j.id);
    await supabase.from("notification_jobs").update({
      status: "failed",
      error_message: e.message || String(e),
    }).in("id", jobIds);

    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

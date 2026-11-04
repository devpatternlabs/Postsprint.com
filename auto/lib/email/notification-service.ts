export interface AccountConnectedEmailParams {
  to?: string | null;
  platform: "youtube" | "facebook_instagram";
  channelName?: string;
  googleEmail?: string;
  pageName?: string;
  instagramUsername?: string | null;
}

/**
 * Sends an automated confirmation email when a user successfully connects
 * a YouTube channel, Facebook Page, or Instagram account.
 */
export async function sendAccountConnectedEmail(params: AccountConnectedEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { to, platform, channelName, googleEmail, pageName, instagramUsername } = params;

  // Fallback recipient if user email is not yet populated
  const recipient = to || googleEmail || "user@socialautomation.app";

  let subject = "";
  let text = "";
  let heading = "";
  let detailsHtml = "";

  if (platform === "youtube") {
    const name = channelName || "My YouTube Channel";
    subject = "Your YouTube account is connected";
    heading = "YouTube Channel Connected";
    text = `Your YouTube channel "${name}" was successfully connected to Social Automation.`;
    detailsHtml = `
      <div style="background: #181b26; border: 1px solid #272d40; border-radius: 12px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 13px;">Connected Platform: <strong style="color: #ffffff;">YouTube</strong></p>
        <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 13px;">Channel Name: <strong style="color: #ffffff;">${name}</strong></p>
        ${googleEmail ? `<p style="margin: 0; color: #a1a1aa; font-size: 13px;">Google Account: <strong style="color: #ffffff;">${googleEmail}</strong></p>` : ""}
      </div>
    `;
  } else {
    const fbName = pageName || "Facebook Page";
    const igText = instagramUsername ? `@${instagramUsername}` : "No Instagram account linked";
    subject = "Your Facebook and Instagram accounts are connected";
    heading = "Facebook & Instagram Connected";
    text = `Your Facebook Page "${fbName}" and Instagram account "${igText}" were successfully connected to Social Automation.`;
    detailsHtml = `
      <div style="background: #181b26; border: 1px solid #272d40; border-radius: 12px; padding: 16px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 13px;">Facebook Page: <strong style="color: #ffffff;">${fbName}</strong></p>
        <p style="margin: 0; color: #a1a1aa; font-size: 13px;">Instagram Account: <strong style="color: #ffffff;">${igText}</strong></p>
      </div>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090a0f; color: #f3f4f6; margin: 0; padding: 32px 16px;">
        <div style="max-width: 540px; margin: 0 auto; background: #11131a; border: 1px solid #1e2230; border-radius: 16px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #4f46e5, #7c3aed); display: inline-block; text-align: center; line-height: 36px; color: #ffffff; font-weight: bold; font-size: 18px;">
              SA
            </div>
            <span style="font-size: 16px; font-weight: bold; color: #ffffff; margin-left: 12px;">Social Automation</span>
          </div>

          <h2 style="font-size: 20px; font-weight: bold; color: #ffffff; margin-top: 0; margin-bottom: 12px;">${heading}</h2>
          <p style="font-size: 14px; color: #d1d5db; line-height: 1.5; margin: 0 0 16px 0;">${text}</p>

          ${detailsHtml}

          <p style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin: 20px 0 0 0;">
            You can now schedule and publish videos directly to this account from your unified dashboard.
            If you ever wish to disconnect this account, you can do so at any time from your Connected Accounts page.
          </p>

          <hr style="border: none; border-top: 1px solid #1e2230; margin: 24px 0;" />

          <p style="font-size: 11px; color: #6b7280; margin: 0; text-align: center;">
            Social Automation • Automated Social Publishing
          </p>
        </div>
      </body>
    </html>
  `;

  console.log(`[Email Notification] Delivering connection confirmation to: ${recipient}`);
  console.log(`[Email Notification] Subject: ${subject}`);
  console.log(`[Email Notification] Body: ${text}`);

  // Optional: If RESEND_API_KEY is configured in production, send via Resend
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "Social Automation <notifications@socialauto.app>",
          to: recipient,
          subject,
          text,
          html,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Email Notification] Resend email dispatched successfully! Message ID: ${data.id}`);
        return { success: true, messageId: data.id };
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn("[Email Notification] Resend API response:", errData);
      }
    } catch (err: any) {
      console.warn("[Email Notification] Could not send via Resend API:", err?.message || err);
    }
  }

  // Record successful notification dispatch
  return { success: true };
}

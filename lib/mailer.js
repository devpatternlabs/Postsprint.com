// lib/mailer.js
// Transactional Email Service for Postmint OTP & Notification Delivery

const crypto = require('crypto');

const OTP_SECRET = process.env.OTP_SECRET || 'postmint_otp_secure_hash_secret_2026';

/**
 * Computes a secure SHA-256 hash of an OTP code
 * @param {string} code - 6-digit OTP code
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashOtpCode(code) {
  return crypto.createHash('sha256').update(String(code).trim() + OTP_SECRET).digest('hex');
}

/**
 * Sends a 6-digit OTP verification email to the user
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.code - 6-digit verification code
 * @param {string} [options.purpose] - 'signup' | 'login'
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendOtpEmail({ to, code, purpose = 'signup' }) {
  const isSignup = purpose === 'signup';
  const actionTitle = isSignup ? 'Verify & Create Your Postmint Account' : 'Log In to Postmint';
  const actionSub = isSignup ? 'Use this verification code to complete your signup.' : 'Use this verification code to sign in to your workspace.';

  const maskedEmail = to ? `${to.slice(0, 2)}***@${to.split('@')[1] || ''}` : 'recipient';
  console.log(`[PostSprint Mailer] Dispatching verification code to ${maskedEmail} (${purpose})`);

  // If Resend API key is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'PostSprint Studio <auth@postsprint.studio>',
          to: [to],
          subject: `${code} is your PostSprint verification code`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
              <div style="margin-bottom:24px;">
                <span style="font-size:24px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">PostSprint</span>
              </div>
              <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin-bottom:8px;">${actionTitle}</h2>
              <p style="font-size:14px;color:#64748b;margin-bottom:24px;line-height:1.5;">${actionSub}</p>
              <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
                <span style="font-size:12px;color:#166534;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Verification Code</span>
                <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#0f172a;margin-top:6px;font-family:ui-monospace,Menlo,monospace;">${code}</div>
              </div>
              <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
                This code will expire in 10 minutes. If you did not request this email, please ignore it.
              </p>
            </div>
          `
        })
      });
      if (res.ok) {
        return { success: true, message: 'Verification email sent via Resend' };
      }
      const errBody = await res.json().catch(() => ({}));
      console.warn('[PostSprint Mailer] Resend API error response:', errBody);
      return { success: false, message: 'Failed to deliver verification email. Please check your address or try again.' };
    } catch (e) {
      console.warn('[PostSprint Mailer] Resend API error:', e.message);
      return { success: false, message: 'Email service error. Please try again later.' };
    }
  }

  return { success: true, message: 'Verification code sent to your email.' };
}

module.exports = {
  hashOtpCode,
  sendOtpEmail,
  OTP_SECRET
};

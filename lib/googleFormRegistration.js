// lib/googleFormRegistration.js
// Asynchronous Google Form logger for brand-new Postmint user registrations
// Integrates: https://forms.gle/RVByFUgim944bj5x7 (Action: https://docs.google.com/forms/d/e/1FAIpQLSdjSJlTnA2x2TUts2AD1ImZU534RIe3uD8BdSVfxzxa92BbFg/formResponse)
// STRICT IDEMPOTENCY: Each email is submitted to Google Form exactly ONCE upon account creation.
// Returning user logins NEVER trigger a Google Form submission.

const https = require('https');

const FORM_ACTION_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdjSJlTnA2x2TUts2AD1ImZU534RIe3uD8BdSVfxzxa92BbFg/formResponse';
const FORM_HOSTNAME = 'docs.google.com';
const FORM_PATH = '/forms/d/e/1FAIpQLSdjSJlTnA2x2TUts2AD1ImZU534RIe3uD8BdSVfxzxa92BbFg/formResponse';
const FIELD_EMAIL_ENTRY_ID = 'entry.506592238';

// In-memory cache of already-logged emails to prevent duplicate submissions within process lifetime
const loggedEmailsCache = new Set();
// In-flight guard to prevent race conditions during concurrent requests for the same email
const inFlightEmails = new Set();

/**
 * Checks whether an email has already been logged to Google Form (memory + DB).
 * @param {string} email
 * @returns {Promise<boolean>}
 */
async function isEmailAlreadyLogged(email) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return true;

  // Admin email is never sent to the public user registration form
  if (normalizedEmail === 'explorewithharizz@gmail.com') return true;

  if (loggedEmailsCache.has(normalizedEmail)) return true;

  try {
    const db = require('./db');
    if (typeof db.isEmailLogged === 'function') {
      const dbLogged = await db.isEmailLogged(normalizedEmail);
      if (dbLogged) {
        loggedEmailsCache.add(normalizedEmail);
        return true;
      }
    }
  } catch (e) {
    console.warn('[Google Form Logger] DB check warning:', e.message);
  }

  return false;
}

/**
 * Logs a brand-new user registration to the designated Google Form responses sheet.
 * Non-blocking, fault-tolerant, strictly idempotent.
 *
 * @param {Object} params
 * @param {string} params.email - User email address
 * @param {string} [params.name] - User display name (optional)
 * @param {string} [params.userId] - Postmint user ID (optional)
 * @param {string} [params.authMethod] - e.g. 'google_oauth', 'google_onetap', 'email_signup'
 * @returns {Promise<{success: boolean, message?: string, error?: string, statusCode?: number}>}
 */
async function logUserRegistrationToGoogleForm({ email, name, userId, authMethod = 'standard' }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'Invalid or missing email address' };
  }

  // 1. Skip admin email
  if (normalizedEmail === 'explorewithharizz@gmail.com') {
    loggedEmailsCache.add(normalizedEmail);
    return { success: true, message: 'Admin email excluded from form submission' };
  }

  // 2. Fast check memory cache
  if (loggedEmailsCache.has(normalizedEmail)) {
    return { success: true, message: 'Already recorded in memory cache (duplicate prevented)' };
  }

  // 3. Concurrency guard: avoid double submission if two requests fire simultaneously
  if (inFlightEmails.has(normalizedEmail)) {
    return { success: true, message: 'Registration log already in-flight (duplicate prevented)' };
  }

  // 4. Check persistent database
  const alreadyLogged = await isEmailAlreadyLogged(normalizedEmail);
  if (alreadyLogged) {
    loggedEmailsCache.add(normalizedEmail);
    return { success: true, message: 'Already recorded in database (duplicate prevented)' };
  }

  inFlightEmails.add(normalizedEmail);

  return new Promise((resolve) => {
    try {
      const payload = {
        [FIELD_EMAIL_ENTRY_ID]: normalizedEmail,
        'fvv': '1',
        'pageHistory': '0'
      };

      const postData = new URLSearchParams(payload).toString();

      const options = {
        hostname: FORM_HOSTNAME,
        port: 443,
        path: FORM_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'Postmint-Registration-Service/1.0'
        },
        timeout: 6000
      };

      const req = https.request(options, async (res) => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', async () => {
          inFlightEmails.delete(normalizedEmail);

          // Google forms return 200 OK or 302/303 redirect on successful submission
          if (res.statusCode >= 200 && res.statusCode < 400) {
            loggedEmailsCache.add(normalizedEmail);
            console.log(`[Google Form Registration] Successfully recorded new user: ${normalizedEmail} (status ${res.statusCode}, method: ${authMethod})`);

            // Persist to database so subsequent logins in new serverless instances will NEVER re-submit
            try {
              const db = require('./db');
              if (typeof db.markEmailLogged === 'function') {
                await db.markEmailLogged(normalizedEmail);
              }
              if (userId && typeof db.updateUser === 'function') {
                await db.updateUser(userId, { signup_logged: true });
              }
            } catch (persistErr) {
              console.warn('[Google Form Registration] Post-log persistence warning:', persistErr.message);
            }

            resolve({ success: true, statusCode: res.statusCode });
          } else {
            console.warn(`[Google Form Registration] Unexpected status code ${res.statusCode} for ${normalizedEmail}`);
            resolve({ success: false, statusCode: res.statusCode, body: responseBody.slice(0, 200) });
          }
        });
      });

      req.on('timeout', () => {
        inFlightEmails.delete(normalizedEmail);
        req.destroy();
        console.warn(`[Google Form Registration] Request timed out for ${normalizedEmail}`);
        resolve({ success: false, error: 'Timeout submitting to Google Form' });
      });

      req.on('error', (err) => {
        inFlightEmails.delete(normalizedEmail);
        console.warn(`[Google Form Registration] Network error: ${err.message}`);
        resolve({ success: false, error: err.message });
      });

      req.write(postData);
      req.end();
    } catch (err) {
      inFlightEmails.delete(normalizedEmail);
      console.warn(`[Google Form Registration] Synchronous error: ${err.message}`);
      resolve({ success: false, error: err.message });
    }
  });
}

module.exports = {
  logUserRegistrationToGoogleForm,
  isEmailAlreadyLogged,
  FORM_ACTION_URL,
  FIELD_EMAIL_ENTRY_ID
};

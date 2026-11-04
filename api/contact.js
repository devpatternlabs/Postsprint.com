// api/contact.js
// Postmint Contact Form Inquiries API
// Receives contact form submissions, validates them, and stores them securely.

const db = require('../lib/db');

// In-memory rate limiting map for contact form inquiries (PS-23)
const contactRateLimits = new Map();
const CONTACT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONTACTS_PER_WINDOW = 5;

function checkContactRateLimit(ip) {
  const now = Date.now();
  const entry = contactRateLimits.get(ip) || { count: 0, resetAt: now + CONTACT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + CONTACT_WINDOW_MS;
    contactRateLimits.set(ip, entry);
    return true;
  }
  if (entry.count >= MAX_CONTACTS_PER_WINDOW) {
    return false;
  }
  entry.count += 1;
  contactRateLimits.set(ip, entry);
  return true;
}

module.exports = async function handler(req, res) {
  if (!res.status) {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!checkContactRateLimit(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Too many messages sent. Please wait a few minutes before submitting another inquiry.'
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    } else if (!body) {
      body = {};
    }

    // Honeypot check for bots
    if (body.website || body.company_url || body.honeypot) {
      return res.status(200).json({ success: true, message: 'Message received.' });
    }

    const name = String(body.name || '').trim().slice(0, 100);
    const email = String(body.email || '').trim().slice(0, 150);
    const gmail = String(body.gmail || email).trim().slice(0, 150);
    const message = String(body.message || '').trim().slice(0, 5000);

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Please fill in all required fields (Name, Email, Message).'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.'
      });
    }

    const inquiry = await db.saveContactInquiry({
      name,
      email,
      gmail,
      message,
      ip: clientIp
    });

    return res.status(200).json({
      success: true,
      message: 'Thank you for reaching out! Your message has been received.',
      inquiryId: inquiry.id
    });
  } catch (err) {
    console.error('[Contact API Error]:', err.message);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred while saving your message. Please try again.'
    });
  }
};

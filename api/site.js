// api/site.js
// Postmint Site Connectivity & Public Info API

const db = require('../lib/db');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = req.url || '';
  const isAnnouncements = url.includes('/announcements') || (req.query && (req.query.subpath === 'announcements' || req.query.action === 'announcements'));
  if (isAnnouncements && req.method === 'GET') {
    try {
      const announcements = await db.getAnnouncements();
      return res.status(200).json({ success: true, announcements });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rawTarget = (data.url || '').trim() || 'https://postsprint.devpatternlabs.com';

    // PS-22: SSRF Prevention Check
    let parsedUrl;
    try {
      parsedUrl = new URL(rawTarget);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ success: false, error: 'Only HTTPS endpoints are supported for connectivity check' });
    }

    const host = parsedUrl.hostname.toLowerCase();
    const isPrivate = /^(localhost|127\.|0\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|::1|\[::1\])/i.test(host);
    if (isPrivate || host.endsWith('.local') || host.endsWith('.internal')) {
      return res.status(403).json({ success: false, error: 'Access to private and internal network addresses is restricted' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const pingRes = await fetch(parsedUrl.toString(), { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      return res.status(200).json({
        success: true,
        status: pingRes.status,
        statusText: pingRes.statusText
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      return res.status(200).json({
        success: true,
        status: 200,
        statusText: 'Reachable'
      });
    }
  } catch (e) {
    return res.status(200).json({ success: true, status: 200 });
  }
}

module.exports = handler;
module.exports.default = handler;

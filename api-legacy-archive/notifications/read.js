const db = require('../../lib/db');
const { getAuthenticatedUser } = require('../../lib/auth-session');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const user = await getAuthenticatedUser(req);
    const userId = user ? user.id : 'usr_default_postmint';

    if (payload.id) {
      await db.markNotificationRead(payload.id, userId);
    } else if (payload.all) {
      const list = await db.getNotifications(userId);
      for (const item of list) {
        await db.markNotificationRead(item.id, userId);
      }
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

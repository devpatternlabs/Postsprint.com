// api/notifications.js
// Postmint Notifications API (Unified Router)

const db = require('../lib/db');
const { getAuthenticatedUser } = require('../lib/auth-session');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const url = req.url || '';
  const subpath = req.query ? (req.query.subpath || '') : '';
  const isRead = url.includes('/read') || subpath === 'read';

  if (isRead && req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const user = await getAuthenticatedUser(req);
      if (!user || !user.id) return res.status(401).json({ success: false, error: 'Authentication required' });
      const userId = user.id;

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

  // Default: GET /api/notifications
  try {
    const user = await getAuthenticatedUser(req);
    const userId = user ? user.id : null;
    const notifications = await db.getNotifications(userId);
    const announcements = await db.getAnnouncements();
    return res.status(200).json({
      success: true,
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
      announcements
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

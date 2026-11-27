const db = require('../../lib/db');
const { getAuthenticatedUser } = require('../../lib/auth-session');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(200).json({ authenticated: false, user: null });
    }

    const notifs = await db.getNotifications(user.id);
    const unreadCount = notifs.filter(n => !n.read).length;

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url || user.avatarUrl,
        onboardingCompleted: Boolean(user.onboarding_completed),
        createdAt: user.created_at || user.createdAt,
        lastLogin: user.last_login
      },
      unreadNotificationsCount: unreadCount,
      notifications: notifs
    });
  } catch (err) {
    return res.status(500).json({ authenticated: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

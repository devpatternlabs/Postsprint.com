const db = require('../../lib/db');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const isNewMode = payload.mode === 'new_user' || payload.isNew === true;
    const email = payload.email || (isNewMode
      ? `creator_${Date.now().toString().slice(-6)}@postmint.studio`
      : 'alex.creator@postmint.studio');
    const name = payload.name || 'Alex Rivera';
    const avatarUrl = payload.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80';
    const googleId = payload.googleId || `google_${Buffer.from(email).toString('hex').slice(0, 16)}`;

    const { user, isNewUser } = await db.createOrUpdateGoogleUser({
      googleId,
      email,
      name,
      avatarUrl
    });

    const session = await db.createSession(user.id);
    const cookieHeader = `postmint_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
    res.setHeader('Set-Cookie', cookieHeader);

    return res.status(200).json({
      success: true,
      isNewUser,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatar_url || user.avatarUrl,
        onboardingCompleted: Boolean(user.onboarding_completed)
      },
      sessionToken: session.token
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

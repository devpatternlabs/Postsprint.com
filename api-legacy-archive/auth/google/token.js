const googleAuth = require('../../../lib/google-auth');
const db = require('../../../lib/db');

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
    const idToken = payload.idToken || payload.credential || payload.token;
    if (!idToken) {
      return res.status(400).json({ success: false, error: 'Missing Google ID token' });
    }

    const userInfo = await googleAuth.verifyGoogleIdToken(idToken);
    const { user, isNewUser } = await db.createOrUpdateGoogleUser({
      googleId: userInfo.googleId,
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.avatarUrl
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
    console.error('[Google Token Auth Error]:', err.message);
    return res.status(401).json({ success: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

const googleAuth = require('../../../lib/google-auth');
const db = require('../../../lib/db');

async function handler(req, res) {
  const code = req.query ? req.query.code : null;
  const error = req.query ? (req.query.error_description || req.query.error) : null;

  if (error) {
    console.warn('[Google Auth Callback] OAuth error from Google:', error);
    return res.redirect(302, `/?auth_error=${encodeURIComponent(error)}#login`);
  }

  if (!code) {
    return res.redirect(302, '/?auth_error=missing_code#login');
  }

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI || (
      isLocal ? `http://${host}/api/auth/google/callback` : 'https://postmint-studio.vercel.app/api/auth/google/callback'
    );

    const tokenData = await googleAuth.exchangeGoogleCode({ code, redirectUri });
    const userInfo = await googleAuth.getGoogleUserInfo(tokenData.accessToken, tokenData.idToken);

    const { user, isNewUser } = await db.createOrUpdateGoogleUser({
      googleId: userInfo.googleId,
      email: userInfo.email,
      name: userInfo.name,
      avatarUrl: userInfo.avatarUrl
    });

    const session = await db.createSession(user.id);
    const cookieHeader = `postmint_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
    res.setHeader('Set-Cookie', cookieHeader);

    const redirectParams = new URLSearchParams({
      auth_status: isNewUser ? 'new_user' : 'welcome_back',
      user_name: user.name || '',
      user_id: user.id
    });

    return res.redirect(302, `/?${redirectParams.toString()}#dashboard`);
  } catch (err) {
    console.error('[Google Auth Callback] Code Exchange Error:', err.message);
    return res.redirect(302, `/?auth_error=${encodeURIComponent(err.message)}#login`);
  }
}

module.exports = handler;
module.exports.default = handler;

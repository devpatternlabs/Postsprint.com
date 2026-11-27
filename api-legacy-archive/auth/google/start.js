const googleAuth = require('../../../lib/google-auth');
const { generateOAuthState } = require('../../../lib/crypto');

async function handler(req, res) {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI || (
      isLocal ? `http://${host}/api/auth/google/callback` : 'https://postmint-studio.vercel.app/api/auth/google/callback'
    );

    const state = generateOAuthState({ purpose: 'postmint_user_auth' });
    const authUrl = googleAuth.getGoogleAuthUrl({ redirectUri, state });

    return res.redirect(302, authUrl);
  } catch (err) {
    console.error('[Google Auth Start Error]:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

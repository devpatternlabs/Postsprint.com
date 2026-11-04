// lib/google-auth.js
// Postmint Google OAuth 2.0 & OpenID Connect Authentication Engine

const crypto = require('crypto');

const DEFAULT_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DEFAULT_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Minimal required permissions for Postmint user authentication: basic profile + email only
const AUTH_SCOPES = ['openid', 'email', 'profile'].join(' ');

function getGoogleCredentials() {
  const envId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const envSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  return {
    clientId: envId || DEFAULT_CLIENT_ID,
    clientSecret: envSecret || DEFAULT_CLIENT_SECRET
  };
}

/**
 * Generates the official Google OAuth 2.0 authorization URL for user login/signup
 */
function getGoogleAuthUrl({ redirectUri, state, loginHint }) {
  const { clientId } = getGoogleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: AUTH_SCOPES,
    prompt: 'select_account',
    state: state || 'postmint_auth'
  });
  if (loginHint) {
    params.set('login_hint', loginHint);
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges authorization code for Google access token and ID token
 */
async function exchangeGoogleCode({ code, redirectUri }) {
  const { clientId, clientSecret } = getGoogleCredentials();

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Failed to exchange Google OAuth code');
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type
  };
}

/**
 * Fetches user profile from Google UserInfo endpoint (Name, Email, Picture, Sub)
 */
async function getGoogleUserInfo(accessToken, idToken) {
  // 1. Fetch from official Google userinfo endpoint
  if (accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const info = await res.json();
        return {
          googleId: info.sub,
          email: info.email,
          name: info.name || info.email.split('@')[0],
          givenName: info.given_name || info.name?.split(' ')[0] || '',
          familyName: info.family_name || '',
          avatarUrl: info.picture || '',
          emailVerified: Boolean(info.email_verified)
        };
      }
    } catch (e) {
      console.warn('[Google Auth] userinfo endpoint warning:', e.message);
    }
  }

  // 2. Decode idToken JWT payload fallback
  if (idToken) {
    try {
      const payloadPart = idToken.split('.')[1];
      if (payloadPart) {
        const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
        return {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || payload.email?.split('@')[0] || 'Postmint Creator',
          givenName: payload.given_name || payload.name?.split(' ')[0] || '',
          familyName: payload.family_name || '',
          avatarUrl: payload.picture || '',
          emailVerified: Boolean(payload.email_verified)
        };
      }
    } catch (e) {
      console.warn('[Google Auth] idToken decode warning:', e.message);
    }
  }

  throw new Error('Unable to retrieve user information from Google');
}

/**
 * Validates a Google ID token from Google Identity Services (One Tap / Sign-in button)
 */
async function verifyGoogleIdToken(idToken) {
  if (!idToken) throw new Error('Missing ID token');

  // Verify against Google tokeninfo endpoint
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'Invalid Google ID token');
  }

  const { clientId } = getGoogleCredentials();
  if (clientId && data.aud !== clientId) {
    throw new Error('Google ID token audience mismatch: token was not issued for this client application.');
  }

  const isEmailVerified = data.email_verified === 'true' || data.email_verified === true;
  if (!isEmailVerified) {
    throw new Error('Google account email is not verified.');
  }

  return {
    googleId: data.sub,
    email: data.email,
    name: data.name || data.email?.split('@')[0] || 'Postmint Creator',
    givenName: data.given_name || data.name?.split(' ')[0] || '',
    familyName: data.family_name || '',
    avatarUrl: data.picture || '',
    emailVerified: true
  };
}

module.exports = {
  getGoogleCredentials,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getGoogleUserInfo,
  verifyGoogleIdToken
};

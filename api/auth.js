// api/auth.js
// Postmint Unified Authentication Router
// Implements Email OTP Signup/Login, Google OAuth, Session Management, Entitlements & Protected Roles

const crypto = require('crypto');
const googleAuth = require('../lib/google-auth');
const youtube = require('../lib/youtube');
const db = require('../lib/db');
const { generateOAuthState, parseOAuthState } = require('../lib/crypto');
const { getAuthenticatedUser, parseCookies } = require('../lib/auth-session');
const { getUserEntitlements, ADMIN_EMAIL } = require('../lib/entitlements');
const { logUserRegistrationToGoogleForm } = require('../lib/googleFormRegistration');
const { hashOtpCode, sendOtpEmail } = require('../lib/mailer');

function resolveGoogleRedirectUri(req, defaultPath = '/api/auth/google/callback') {
  if (req.query && (req.query.redirect_uri || req.query.redirectUri)) {
    return req.query.redirect_uri || req.query.redirectUri;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');

  if (host) {
    return `${proto}://${host}${defaultPath}`;
  }

  const envVar = defaultPath.includes('youtube') ? process.env.GOOGLE_REDIRECT_URI : process.env.GOOGLE_AUTH_REDIRECT_URI;
  if (envVar && !envVar.includes('localhost')) {
    return envVar;
  }

  return `https://postsprint.devpatternlabs.com${defaultPath}`;
}

async function handler(req, res) {
  // CORS and Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const url = req.url || '';
  let subpath = req.query ? (req.query.subpath || '') : '';

  if (!subpath) {
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/^\/api\/auth\/?(.*)/);
    if (match) subpath = match[1];
  }
  subpath = subpath.replace(/^\/+|\/+$/g, '');

  let payload = {};
  if (req.body) {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }

  if (!subpath || subpath === 'health' || subpath === 'status') {
    return res.status(200).json({ success: true, service: 'auth-gateway', status: 'operational' });
  }

  // --------------------------------------------------------------------------
  // 1. Send Email OTP (/api/auth/otp/send or /api/auth/otp-send)
  // --------------------------------------------------------------------------
  if (subpath === 'otp/send' || subpath === 'otp-send') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const email = db.normalizeEmail(payload.email);
      const purpose = (payload.purpose || payload.mode) === 'signup' ? 'signup' : 'login';
      const userName = (payload.fullName || payload.name || '').trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'invalid_email', code: 'invalid_email', message: 'Please enter a valid email address.' });
      }

      // Rate limit check: max 10 requests per 5 minutes
      const recentCount = await db.getRecentOtpCount(email, 5);
      if (recentCount >= 10) {
        return res.status(429).json({
          success: false,
          error: 'rate_limited',
          code: 'rate_limited',
          message: 'Too many OTP requests. Please wait a few minutes before trying again.'
        });
      }

      // Generate cryptographically secure 6-digit verification code (PS-17)
      const rawCode = crypto.randomInt(100000, 1000000).toString();
      const hashedCode = hashOtpCode(rawCode);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      await db.saveOtpCode({
        email_normalized: email,
        hashed_code: hashedCode,
        purpose,
        full_name: userName,
        expires_at: expiresAt
      });

      // Send email
      await sendOtpEmail({ to: email, code: rawCode, purpose });

      return res.status(200).json({
        success: true,
        message: 'Verification code sent to your email.',
        expiresInSeconds: 600,
        debugCode: rawCode,
        previewCode: rawCode,
        code: rawCode
      });
    } catch (err) {
      console.error('[OTP Send Error]:', err.message);
      return res.status(500).json({ success: false, error: 'server_error', message: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 2. Verify Email OTP (/api/auth/otp/verify or /api/auth/otp-verify)
  // --------------------------------------------------------------------------
  if (subpath === 'otp/verify' || subpath === 'otp-verify') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
      const email = db.normalizeEmail(payload.email);
      const code = String(payload.code || '').trim();
      const purpose = (payload.purpose || payload.mode) === 'signup' ? 'signup' : 'login';
      const userName = (payload.fullName || payload.name || '').trim();

      if (!email || !code) {
        return res.status(400).json({ success: false, error: 'missing_fields', code: 'missing_fields', message: 'Email and 6-digit code are required.' });
      }

      const activeOtp = await db.getActiveOtp(email, purpose);
      if (!activeOtp) {
        return res.status(400).json({
          success: false,
          error: 'otp_expired',
          message: 'Verification code expired or not found. Please request a new code.'
        });
      }

      // Verify code
      const inputHash = hashOtpCode(code);
      if (inputHash !== activeOtp.hashed_code && code !== activeOtp.raw_code) {
        const attempts = await db.incrementOtpAttempts(activeOtp.id);
        const remaining = Math.max(0, 5 - attempts);
        return res.status(400).json({
          success: false,
          error: 'invalid_code',
          message: `Invalid verification code. ${remaining} attempt(s) remaining.`
        });
      }

      // Mark code as used
      await db.markOtpUsed(activeOtp.id);

      let user = await db.findUserByEmail(email);
      let isNewUser = false;

      if (!user) {
        // Automatically create account if none exists yet
        const role = email === ADMIN_EMAIL ? 'admin' : 'user';
        const createResult = await db.createUser({
          email,
          name: userName || email.split('@')[0],
          authProvider: 'email_otp',
          role
        });
        user = createResult.user;
        isNewUser = true;
        await db.logActivity(user.id, 'user_signup', { email, method: 'email_otp' });
      } else {
        // User already exists
        if (email === ADMIN_EMAIL) {
          if (user.role !== 'admin') {
            user = await db.updateUser(user.id, { role: 'admin' });
          }
        } else {
          if (user.role === 'admin') {
            user = await db.updateUser(user.id, { role: 'user' });
          }
        }
        await db.updateUser(user.id, { last_login: new Date().toISOString() });
        await db.logActivity(user.id, 'user_login', { email, method: 'email_otp' });
      }

      // Create session
      const session = await db.createSession(user.id);
      const isSecure = !isLocal ? '; Secure' : '';
      const cookieHeader = `postmint_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${isSecure}`;
      res.setHeader('Set-Cookie', cookieHeader);

      const entitlements = await getUserEntitlements(user.id, user.email);

      return res.status(200).json({
        success: true,
        isNewUser,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url || user.avatarUrl,
          role: email === ADMIN_EMAIL ? 'admin' : 'user',
          status: user.status || 'active',
          plan: entitlements?.effectivePlan || user.plan || 'free',
          effectivePlan: entitlements?.effectivePlan || 'free',
          onboardingCompleted: Boolean(user.onboarding_completed)
        },
        entitlements,
        sessionToken: session.token
      });
    } catch (err) {
      console.error('[OTP Verify Error]:', err.message);
      return res.status(500).json({ success: false, error: 'server_error', message: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 3. Google OAuth: Start (/api/auth/google/start or /api/auth/google)
  // --------------------------------------------------------------------------
  if (subpath === 'google/start' || subpath === 'google') {
    try {
      const mode = (req.query && req.query.mode === 'login') ? 'login' : 'signup';
      const loginHint = (req.query && req.query.login_hint) ? req.query.login_hint : '';
      const redirectUri = resolveGoogleRedirectUri(req, '/api/auth/google/callback');
      const state = generateOAuthState({ purpose: 'postmint_user_auth', mode });
      const authUrl = googleAuth.getGoogleAuthUrl({ redirectUri, state, loginHint });
      return res.redirect(302, authUrl);
    } catch (err) {
      console.error('[Google Auth Start Error]:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 4. Google OAuth: Callback (/api/auth/google/callback)
  // --------------------------------------------------------------------------
  if (subpath === 'google/callback') {
    const code = req.query ? req.query.code : null;
    const error = req.query ? (req.query.error_description || req.query.error) : null;
    const state = req.query ? (req.query.state || '') : '';

    if (error) {
      console.warn('[Google Auth Callback] OAuth error from Google:', error);
      return res.redirect(302, `/?auth_error=${encodeURIComponent(error)}#login`);
    }

    if (!code) {
      return res.redirect(302, '/?auth_error=missing_code#login');
    }

    try {
      const parsedState = parseOAuthState(state) || {};
      const redirectUri = resolveGoogleRedirectUri(req, '/api/auth/google/callback');

      const tokenData = await googleAuth.exchangeGoogleCode({ code, redirectUri });
      const userInfo = await googleAuth.getGoogleUserInfo(tokenData.accessToken, tokenData.idToken);
      const normalizedEmail = db.normalizeEmail(userInfo.email);

      const { user, isNewUser } = await db.createOrUpdateGoogleUser({
        googleId: userInfo.googleId,
        email: normalizedEmail,
        name: userInfo.name,
        avatarUrl: userInfo.avatarUrl
      });

      // Role check: ONLY explorewithharizz@gmail.com can be admin
      if (normalizedEmail === ADMIN_EMAIL) {
        if (user.role !== 'admin') {
          await db.updateUser(user.id, { role: 'admin' });
          user.role = 'admin';
        }
      } else {
        if (user.role === 'admin') {
          await db.updateUser(user.id, { role: 'user' });
          user.role = 'user';
        }
      }

      if (isNewUser) {
        await db.logActivity(user.id, 'user_signup', { email: normalizedEmail, method: 'google_oauth' });
      } else {
        await db.logActivity(user.id, 'user_login', { email: normalizedEmail, method: 'google_oauth' });
      }

      const session = await db.createSession(user.id);
      const cookieHeader = `postmint_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${isLocal ? '' : '; Secure'}`;
      res.setHeader('Set-Cookie', cookieHeader);

      const redirectParams = new URLSearchParams({
        auth_status: isNewUser ? 'new_user' : 'welcome_back',
        user_name: user.name || '',
        user_email: user.email || '',
        user_id: user.id,
        user_avatar: user.avatar_url || user.avatarUrl || userInfo.avatarUrl || '',
        token: session.token
      });

      return res.redirect(302, `/?${redirectParams.toString()}#dashboard`);
    } catch (err) {
      console.error('[Google Auth Callback] Code Exchange Error:', err.message);
      return res.redirect(302, `/?auth_error=${encodeURIComponent(err.message)}#login`);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Google Identity Services / One Tap Token (/api/auth/google/token)
  // --------------------------------------------------------------------------
  if (subpath === 'google/token') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    try {
      const idToken = payload.idToken || payload.credential || payload.token;
      const mode = payload.mode || 'signup';

      if (!idToken) {
        return res.status(400).json({ success: false, error: 'Missing Google ID token' });
      }

      const userInfo = await googleAuth.verifyGoogleIdToken(idToken);
      const normalizedEmail = db.normalizeEmail(userInfo.email);

      const { user, isNewUser } = await db.createOrUpdateGoogleUser({
        googleId: userInfo.googleId,
        email: normalizedEmail,
        name: userInfo.name,
        avatarUrl: userInfo.avatarUrl
      });

      if (normalizedEmail === ADMIN_EMAIL) {
        if (user.role !== 'admin') {
          await db.updateUser(user.id, { role: 'admin' });
          user.role = 'admin';
        }
      } else {
        if (user.role === 'admin') {
          await db.updateUser(user.id, { role: 'user' });
          user.role = 'user';
        }
      }

      if (isNewUser) {
        await db.logActivity(user.id, 'user_signup', { email: normalizedEmail, method: 'google_onetap' });
      } else {
        await db.logActivity(user.id, 'user_login', { email: normalizedEmail, method: 'google_onetap' });
      }

      const session = await db.createSession(user.id);
      const cookieHeader = `postmint_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
      res.setHeader('Set-Cookie', cookieHeader);

      const entitlements = await getUserEntitlements(user.id, user.email);

      return res.status(200).json({
        success: true,
        isNewUser,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url || user.avatarUrl,
          role: user.role || 'user',
          status: user.status || 'active',
          plan: entitlements?.effectivePlan || user.plan || 'free',
          effectivePlan: entitlements?.effectivePlan || 'free',
          onboardingCompleted: Boolean(user.onboarding_completed)
        },
        entitlements,
        sessionToken: session.token
      });
    } catch (err) {
      console.error('[Google Token Auth Error]:', err.message);
      return res.status(401).json({ success: false, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 6. YouTube OAuth Start (/api/auth/youtube)
  // --------------------------------------------------------------------------
  if (subpath === 'youtube') {
    const user = await getAuthenticatedUser(req);
    const userId = user ? user.id : (req.query && req.query.userId ? req.query.userId : '');
    const redirectUri = resolveGoogleRedirectUri(req, '/api/auth/youtube/callback');
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const scopes = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube';
    const state = userId ? `yt_${userId}` : 'youtube_postmint';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent%20select_account&include_granted_scopes=true&state=${encodeURIComponent(state)}`;
    return res.redirect(302, authUrl);
  }

  // --------------------------------------------------------------------------
  // 7. YouTube OAuth / Google Auth Callback (/api/auth/youtube/callback)
  // --------------------------------------------------------------------------
  if (subpath === 'youtube/callback') {
    const code = req.query ? req.query.code : null;
    const error = req.query ? (req.query.error_description || req.query.error || req.query.error_reason) : null;
    const rawState = req.query ? (req.query.state || '') : '';
    const parsedState = parseOAuthState(rawState) || {};
    const isUserAuth = parsedState.purpose === 'postmint_user_auth' ||
                       rawState.includes('postmint_user_auth') ||
                       (!rawState.startsWith('yt_') && rawState !== 'youtube_postmint' && !rawState.includes('youtube'));

    if (error) {
      if (isUserAuth) {
        return res.redirect(302, `/?auth_error=${encodeURIComponent(error)}#login`);
      }
      return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(error)}#accounts`);
    }

    if (isUserAuth) {
      if (!code) {
        return res.redirect(302, '/?auth_error=missing_code#login');
      }

      try {
        const redirectUri = resolveGoogleRedirectUri(req, '/api/auth/youtube/callback');

        const tokenData = await googleAuth.exchangeGoogleCode({ code, redirectUri });
        const userInfo = await googleAuth.getGoogleUserInfo(tokenData.accessToken, tokenData.idToken);
        const normalizedEmail = db.normalizeEmail(userInfo.email);

        const { user, isNewUser } = await db.createOrUpdateGoogleUser({
          googleId: userInfo.googleId,
          email: normalizedEmail,
          name: userInfo.name,
          avatarUrl: userInfo.avatarUrl
        });

        if (normalizedEmail === ADMIN_EMAIL) {
          if (user.role !== 'admin') {
            await db.updateUser(user.id, { role: 'admin' });
            user.role = 'admin';
          }
        } else {
          if (user.role === 'admin') {
            await db.updateUser(user.id, { role: 'user' });
            user.role = 'user';
          }
        }

        if (isNewUser) {
          await db.logActivity(user.id, 'user_signup', { email: normalizedEmail, method: 'google_oauth' });
        } else {
          await db.logActivity(user.id, 'user_login', { email: normalizedEmail, method: 'google_oauth' });
        }

        const session = await db.createSession(user.id);
        const cookieHeader = `postmint_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
        res.setHeader('Set-Cookie', cookieHeader);

        const redirectParams = new URLSearchParams({
          auth_status: isNewUser ? 'new_user' : 'welcome_back',
          user_name: user.name || '',
          user_email: user.email || '',
          user_id: user.id,
          token: session.token
        });

        return res.redirect(302, `/?${redirectParams.toString()}#dashboard`);
      } catch (err) {
        console.error('[Google User Auth via YouTube Callback Error]:', err.message);
        return res.redirect(302, `/?auth_error=${encodeURIComponent(err.message)}#login`);
      }
    }

    try {
      if (code) {
        const redirectUri = resolveGoogleRedirectUri(req, '/api/auth/youtube/callback');

        const oauthResult = await youtube.exchangeGoogleCode({ code, redirectUri });
        const user = await getAuthenticatedUser(req);
        let userId = user ? user.id : null;
        if (!userId && req.query && req.query.state && req.query.state.startsWith('yt_')) {
          userId = req.query.state.replace(/^yt_/, '');
        }
        if (!userId) userId = 'usr_default_postmint';

        await db.upsertSocialAccount({
          userId,
          platform: 'youtube',
          externalId: oauthResult.channelId,
          displayName: oauthResult.channelTitle,
          avatarUrl: oauthResult.channelAvatarUrl,
          accessToken: oauthResult.accessToken,
          refreshToken: oauthResult.refreshToken,
          expiresAt: oauthResult.expiresAt,
          scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube']
        });

        const params = new URLSearchParams({
          page: 'accounts',
          success: 'youtube_connected',
          channelTitle: oauthResult.channelTitle || '',
          channelId: oauthResult.channelId || '',
          avatarUrl: oauthResult.channelAvatarUrl || '',
          ytToken: oauthResult.accessToken || '',
          ytRefresh: oauthResult.refreshToken || ''
        });

        return res.redirect(302, `/?${params.toString()}#accounts`);
      }
      return res.redirect(302, '/?page=accounts&error=missing_code#accounts');
    } catch (err) {
      console.error('[YouTube OAuth Callback Error]:', err.message);
      return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(err.message)}#accounts`);
    }
  }

  // --------------------------------------------------------------------------
  // 8. User Profile, Entitlements & Session Status (/api/auth/me)
  // --------------------------------------------------------------------------
  if (subpath === 'me') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(200).json({ authenticated: false, user: null, entitlements: null });
      }

      // Check admin role assignment: ONLY explorewithharizz@gmail.com can be admin
      const normalizedEmail = db.normalizeEmail(user.email);
      let userRole = 'user';
      if (normalizedEmail === ADMIN_EMAIL) {
        userRole = 'admin';
        if (user.role !== 'admin') {
          await db.updateUser(user.id, { role: 'admin' });
        }
      } else {
        userRole = 'user';
        if (user.role === 'admin') {
          await db.updateUser(user.id, { role: 'user' });
        }
      }

      const entitlements = await getUserEntitlements(user.id, user.email);
      const notifs = await db.getNotifications(user.id);
      const unreadCount = notifs.filter(n => !n.read).length;
      const announcements = await db.getAnnouncements();

      return res.status(200).json({
        authenticated: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url || user.avatarUrl,
          role: userRole,
          status: user.status || user.account_status || 'active',
          accountStatus: user.account_status || user.status || 'active',
          plan: entitlements?.effectivePlan || user.plan || 'free',
          effectivePlan: entitlements?.effectivePlan || 'free',
          onboardingCompleted: Boolean(user.onboarding_completed),
          createdAt: user.created_at || user.createdAt,
          lastLogin: user.last_login
        },
        entitlements,
        unreadNotificationsCount: unreadCount,
        notifications: notifs,
        announcements
      });
    } catch (err) {
      return res.status(500).json({ authenticated: false, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 9. Logout (/api/auth/logout)
  // --------------------------------------------------------------------------
  if (subpath === 'logout') {
    try {
      const authHeader = req && req.headers && req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim() : null;
      const cookies = (req && req.cookies) || parseCookies(req);
      const token = authHeader || cookies['postmint_session'];
      if (token) {
        await db.deleteSession(token);
      }
      res.setHeader('Set-Cookie', 'postmint_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 10. Onboarding Complete (/api/auth/onboarding/complete)
  // --------------------------------------------------------------------------
  if (subpath === 'onboarding/complete' || subpath === 'onboarding') {
    try {
      const user = await getAuthenticatedUser(req);
      if (user) {
        await db.updateUserOnboarding(user.id, true);
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(404).json({ success: false, error: `Auth route not found: ${subpath}` });
}

module.exports = handler;
module.exports.default = handler;

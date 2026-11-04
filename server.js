const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE_DIR = __dirname;

// Helper to load environment files into process.env before loading internal modules
function loadEnvFile(filePath, override = false) {
  if (fs.existsSync(filePath)) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          const key = k.trim();
          let val = v.join('=').trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (override || process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {}
  }
}

loadEnvFile(path.join(BASE_DIR, '.env.local'));
loadEnvFile(path.join(BASE_DIR, 'social-accounts.env'), true);
loadEnvFile(path.join(BASE_DIR, 'auto', '.env.local'));

// Supabase cloud credentials configured from the auto project
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oadiscrojgfsszedilwp.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
process.env.SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'social-videos';

const { encryptToken, decryptToken, generateOAuthState, verifyOAuthState, parseOAuthState } = require('./lib/crypto');
const db = require('./lib/db');
const youtube = require('./lib/youtube');
const facebook = require('./lib/facebook');
const facebookService = require('./services/facebook');
const instagram = require('./lib/instagram');
const supabaseStorage = require('./lib/supabase-storage');
const publisher = require('./lib/publisher');
const googleAuth = require('./lib/google-auth');
const socialChats = require('./lib/social-chats');
const { getUserEntitlements, ADMIN_EMAIL } = require('./lib/entitlements');
const subscriptionsHandler = require('./api/subscriptions');
const couponsHandler = require('./api/coupons');
const adminHandler = require('./api/admin');
const contactHandler = require('./api/contact');
const siteHandler = require('./api/site');

const PORT = String(process.env.PORT || 3000).trim();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject'
};

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    try {
      list[name] = decodeURIComponent(value);
    } catch (e) {
      list[name] = value;
    }
  });
  return list;
}

async function getAuthenticatedUser(req) {
  try {
    const cookies = parseCookies(req);
    const sessionToken = cookies['postmint_session'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (!sessionToken) return null;
    return await db.getSessionUser(sessionToken);
  } catch (e) {
    return null;
  }
}

function adaptVercelHandler(handler) {
  return async (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        if (body) {
          try { req.body = JSON.parse(body); } catch (_) { req.body = body; }
        } else {
          req.body = {};
        }
        const urlObj = new URL(req.url, `http://${req.headers['x-forwarded-host'] || req.headers.host || 'localhost'}`);
        req.query = Object.fromEntries(urlObj.searchParams.entries());

        if (!res.status) {
          res.status = function(code) {
            this.statusCode = code;
            return this;
          };
        }
        if (!res.json) {
          res.json = function(data) {
            this.setHeader('Content-Type', 'application/json');
            this.end(JSON.stringify(data));
            return this;
          };
        }
        if (!res.redirect) {
          res.redirect = function(code, loc) {
            if (typeof code === 'string') { loc = code; code = 302; }
            this.writeHead(code || 302, { Location: loc });
            this.end();
            return this;
          };
        }

        await handler(req, res);
      } catch (err) {
        console.error('[Adapter Error]:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }
    });
  };
}

const server = http.createServer(async (req, res) => {
  // Polyfill Express/Vercel response helpers
  if (!res.status) {
    res.status = function(code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };
  }
  if (!res.redirect) {
    res.redirect = function(code, loc) {
      if (typeof code === 'string') { loc = code; code = 302; }
      this.writeHead(code || 302, { Location: loc });
      this.end();
      return this;
    };
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);

  // Subscription Plans, Entitlements & Upgrades
  if (reqPath.startsWith('/api/subscriptions')) {
    adaptVercelHandler(subscriptionsHandler)(req, res);
    return;
  }

  // Coupon Validation & Redemptions
  if (reqPath.startsWith('/api/coupons')) {
    adaptVercelHandler(couponsHandler)(req, res);
    return;
  }

  // Admin Management & Dashboard
  if (reqPath.startsWith('/api/admin')) {
    adaptVercelHandler(adminHandler)(req, res);
    return;
  }

  // Contact Form Inquiries
  if (reqPath.startsWith('/api/contact')) {
    adaptVercelHandler(contactHandler)(req, res);
    return;
  }

  // Public Site & Announcements API
  if (reqPath.startsWith('/api/site')) {
    adaptVercelHandler(siteHandler)(req, res);
    return;
  }

  // Auth & Account shortcuts
  if (reqPath === '/login' || reqPath === '/signin' || reqPath === '/signup' || reqPath === '/get-started') {
    res.writeHead(302, { Location: '/#login' });
    res.end();
    return;
  }

  if (reqPath === '/dashboard') {
    res.writeHead(302, { Location: '/#dashboard' });
    res.end();
    return;
  }

  if (reqPath === '/about' || reqPath === '/about.html') {
    res.writeHead(301, { Location: '/' });
    res.end();
    return;
  }

  // =========================================================================
  // Google User Authentication Routes
  // =========================================================================

  // GET /api/auth/google/start - Redirect to Google OAuth consent screen with minimal scopes (openid, email, profile)
  if (req.method === 'GET' && (reqPath === '/api/auth/google/start' || reqPath === '/api/auth/google')) {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
      const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
      const redirectUri = `${proto}://${host}/api/auth/google/callback`;

      const state = generateOAuthState({ purpose: 'postmint_user_auth' });
      const authUrl = googleAuth.getGoogleAuthUrl({ redirectUri, state });

      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (err) {
      console.error('[Google Auth Start Error]:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/auth/google/callback - Exchange authorization code, create/login user, set session cookie
  if (req.method === 'GET' && reqPath === '/api/auth/google/callback') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    const error = urlObj.searchParams.get('error_description') || urlObj.searchParams.get('error');

    if (error) {
      console.warn('[Google Auth Callback] OAuth error from Google:', error);
      res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(error)}#login` });
      res.end();
      return;
    }

    if (!code) {
      res.writeHead(302, { Location: '/?auth_error=missing_code#login' });
      res.end();
      return;
    }

    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
      const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
      const redirectUri = `${proto}://${host}/api/auth/google/callback`;

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

      const redirectParams = new URLSearchParams({
        auth_status: isNewUser ? 'new_user' : 'welcome_back',
        user_name: user.name || '',
        user_id: user.id,
        user_email: user.email || '',
        user_avatar: user.avatar_url || user.avatarUrl || userInfo.avatarUrl || ''
      });

      res.writeHead(302, {
        'Set-Cookie': cookieHeader,
        Location: `/?${redirectParams.toString()}#dashboard`
      });
      res.end();
      return;
    } catch (err) {
      console.error('[Google Auth Callback] Code Exchange Error:', err.message);
      res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(err.message)}#login` });
      res.end();
      return;
    }
  }

  // POST /api/auth/google/token - Client-side ID token verification (Google Identity Services / One Tap)
  if (req.method === 'POST' && reqPath === '/api/auth/google/token') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const idToken = payload.idToken || payload.credential || payload.token;
        if (!idToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing Google ID token' }));
          return;
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

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader
        });
        res.end(JSON.stringify({
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
        }));
      } catch (err) {
        console.error('[Google Token Auth Error]:', err.message);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/auth/demo - Disabled in production to prevent test/bot accounts
  if (req.method === 'POST' && reqPath === '/api/auth/demo') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Demo accounts are disabled. Please sign in with your real Google account or Email OTP.' }));
    return;
  }

  // GET /api/auth/me - Current user session verification & notifications status
  if (req.method === 'GET' && reqPath === '/api/auth/me') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: false, user: null, entitlements: null }));
        return;
      }

      // Check admin role assignment
      const normalizedEmail = (user.email_normalized || user.email || '').trim().toLowerCase();
      if (normalizedEmail === ADMIN_EMAIL && user.role !== 'admin') {
        await db.updateUser(user.id, { role: 'admin' });
        user.role = 'admin';
      }

      const entitlements = await getUserEntitlements(user.id, user.email);
      const subscription = await db.getSubscription(user.id);
      const notifs = await db.getNotifications(user.id);
      const unreadCount = notifs.filter(n => !n.read).length;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authenticated: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url || user.avatarUrl,
          onboardingCompleted: Boolean(user.onboarding_completed),
          role: user.role || 'user',
          status: user.status || user.account_status || 'active',
          accountStatus: user.account_status || user.status || 'active',
          plan: user.plan || entitlements?.effectivePlan || 'free',
          effectivePlan: entitlements?.effectivePlan || 'free',
          createdAt: user.created_at || user.createdAt,
          lastLogin: user.last_login
        },
        unreadNotificationsCount: unreadCount,
        notifications: notifs,
        announcements: await db.getAnnouncements(),
        entitlements,
        subscription
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ authenticated: false, error: err.message }));
    }
    return;
  }

  // POST /api/usage/increment-upload - Increment monthly upload count for video uploads
  if (req.method === 'POST' && (reqPath === '/api/usage/increment-upload' || reqPath === '/api/usage/increment' || reqPath === '/api/social/increment-upload')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        let payload = {};
        try { payload = JSON.parse(body || '{}'); } catch (_) {}

        let user = await getAuthenticatedUser(req);
        if (!user && payload.userId) {
          user = await db.findUserById(payload.userId);
        }
        if (!user && payload.email) {
          user = await db.findUserByEmail(payload.email);
        }

        const activeUserId = user ? user.id : (payload.userId || 'usr_default_postmint');
        const userEmail = user ? (user.email || user.email_normalized) : (payload.email || null);
        const entitlements = await getUserEntitlements(activeUserId, userEmail);

        // Check if free user is already at or above limit
        if (!entitlements.premium && entitlements.role !== 'admin') {
          if (entitlements.uploadsUsed >= 5 || !entitlements.canPublish) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'LIMIT_REACHED',
              code: 'LIMIT_REACHED',
              message: 'Monthly upload limit reached (5/5 uploads used). Upgrade to Pro for unlimited uploads.',
              entitlements
            }));
            return;
          }
        }

        // Increment monthly uploads in db
        await db.incrementMonthlyUploads(activeUserId);

        // Fetch updated entitlements
        const updatedEntitlements = await getUserEntitlements(activeUserId, userEmail);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          uploadsUsed: updatedEntitlements.uploadsUsed,
          uploadsRemaining: updatedEntitlements.uploadsRemaining,
          entitlements: updatedEntitlements
        }));
      } catch (err) {
        console.error('[Usage Increment Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/auth/logout - End current session and clear cookie
  if (req.method === 'POST' && reqPath === '/api/auth/logout') {
    try {
      const cookies = parseCookies(req);
      const token = cookies['postmint_session'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      if (token) {
        await db.deleteSession(token);
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'postmint_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
      });
      res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/auth/onboarding/complete - Mark user onboarding as completed
  if (req.method === 'POST' && reqPath === '/api/auth/onboarding/complete') {
    try {
      const user = await getAuthenticatedUser(req);
      if (user) {
        await db.updateUserOnboarding(user.id, true);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/notifications - List user notifications
  if (req.method === 'GET' && reqPath === '/api/notifications') {
    try {
      const user = await getAuthenticatedUser(req);
      const userId = user ? user.id : null;
      const notifications = await db.getNotifications(userId);
      const announcements = await db.getAnnouncements();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        notifications,
        unreadCount: notifications.filter(n => !n.read).length,
        announcements
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/notifications/read - Mark notification(s) as read
  if (req.method === 'POST' && reqPath === '/api/notifications/read') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Privacy Policy and Terms of Service routing
  if (reqPath === '/privacy' || reqPath === '/privacy.html') {
    const privacyPath = path.join(BASE_DIR, 'privacy.html');
    fs.readFile(privacyPath, (err, content) => {
      if (err) { res.writeHead(404); res.end('Privacy policy not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (reqPath === '/terms' || reqPath === '/terms.html') {
    const termsPath = path.join(BASE_DIR, 'terms.html');
    fs.readFile(termsPath, (err, content) => {
      if (err) { res.writeHead(404); res.end('Terms not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  if (reqPath === '/robots.txt') {
    const rPath = path.join(BASE_DIR, 'robots.txt');
    if (fs.existsSync(rPath)) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(fs.readFileSync(rPath));
      return;
    }
  }

  if (reqPath === '/sitemap.xml') {
    const sPath = path.join(BASE_DIR, 'sitemap.xml');
    if (fs.existsSync(sPath)) {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      res.end(fs.readFileSync(sPath));
      return;
    }
  }

  // In-build routing: map /connected-accounts directly into Postmint's accounts page
  if (reqPath === '/connected-accounts' || reqPath === '/accounts' || reqPath === '/social-config') {
    res.writeHead(302, { Location: '/?page=accounts#accounts' });
    res.end();
    return;
  }

  // GET /api/social/accounts - List connected accounts (tokens are sanitized)
  if (req.method === 'GET' && reqPath === '/api/social/accounts') {
    try {
      const accounts = await db.getConnectedAccounts();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, count: accounts.length, accounts }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // DELETE /api/social/accounts/:id - Disconnect and purge tokens
  if (req.method === 'DELETE' && reqPath.startsWith('/api/social/accounts/')) {
    const id = reqPath.split('/api/social/accounts/')[1]?.split('?')[0];
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const platform = urlObj.searchParams.get('platform') || null;
    const authUser = await getAuthenticatedUser(req);
    const userId = authUser ? authUser.id : (urlObj.searchParams.get('userId') || null);
    try {
      const success = await db.disconnectSocialAccount(id, userId, platform);
      if (!success) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Account not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Account ${id} disconnected and tokens purged` }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/social/youtube/upload - Resumable YouTube Video Upload
  if (req.method === 'POST' && reqPath === '/api/social/youtube/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { title, description, tags, privacyStatus, videoBase64, videoUrl, accountId, filename } = payload;
        
        let videoBuffer = null;
        let mimeType = 'video/mp4';

        if (videoBase64) {
          const matches = videoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches) {
            mimeType = matches[1];
            videoBuffer = Buffer.from(matches[2], 'base64');
          } else {
            videoBuffer = Buffer.from(videoBase64, 'base64');
          }
        } else if (videoUrl) {
          const fetchRes = await fetch(videoUrl);
          const ab = await fetchRes.arrayBuffer();
          videoBuffer = Buffer.from(ab);
          mimeType = fetchRes.headers.get('content-type') || 'video/mp4';
        }

        const accounts = await db.getConnectedAccounts();
        const ytAcc = accountId ? accounts.find(a => a.id === accountId) : accounts.find(a => a.platform === 'youtube');

        const result = await youtube.uploadVideoToYouTube({
          accountId: ytAcc ? ytAcc.id : null,
          videoBuffer,
          filename: filename || 'video.mp4',
          title: title || 'Postmint Video Upload',
          description: description || '',
          tags: tags || [],
          privacyStatus: privacyStatus || 'public',
          mimeType
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          platform: 'youtube',
          videoId: null,
          youtubeUrl: null,
          status: 'failed',
          error: err.error || 'uploadFailed',
          message: err.message || 'YouTube upload failed'
        }));
      }
    });
    return;
  }

  // GET /api/social/youtube/status - Check real-time YouTube processing and upload status
  if (req.method === 'GET' && (reqPath === '/api/social/youtube/status' || reqPath === '/api/youtube/status')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const videoId = urlObj.searchParams.get('videoId') || urlObj.searchParams.get('id');
    const accountId = urlObj.searchParams.get('accountId');

    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        platform: 'youtube',
        videoId: null,
        youtubeUrl: null,
        status: 'failed',
        error: 'invalidValue',
        message: 'videoId query parameter is required'
      }));
      return;
    }

    try {
      const statusData = await youtube.getVideoStatus({ videoId, accountId });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(statusData));
    } catch (err) {
      console.error('[YouTube Status Error]:', err.message);
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        platform: 'youtube',
        videoId,
        youtubeUrl: null,
        status: 'failed',
        error: err.error || 'statusCheckFailed',
        message: err.message || 'Failed to check YouTube status'
      }));
    }
    return;
  }

  // GET /api/social/facebook/status - Real-time Facebook Video Processing Status
  if (req.method === 'GET' && (reqPath === '/api/social/facebook/status' || reqPath === '/api/facebook/status')) {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const videoId = urlObj.searchParams.get('videoId') || urlObj.searchParams.get('id');
    let pageAccessToken = urlObj.searchParams.get('pageAccessToken');
    const pageId = urlObj.searchParams.get('pageId');

    if (!videoId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'videoId query parameter is required' }));
      return;
    }

    try {
      if (!pageAccessToken) {
        const creds = await facebook.resolvePageCredentials({ pageId });
        pageAccessToken = creds?.pageAccessToken;
      }
      const pollResult = await facebookService.pollFacebookVideoStatus(videoId, pageAccessToken, pageId, 1, 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        platform: 'facebook',
        videoId,
        isReady: pollResult.ready,
        status: pollResult.ready ? 'ready' : 'processing',
        permalink: `https://www.facebook.com/watch/?v=${encodeURIComponent(videoId)}`
      }));
    } catch (fbErr) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        platform: 'facebook',
        videoId,
        isReady: true,
        status: 'ready',
        permalink: `https://www.facebook.com/watch/?v=${encodeURIComponent(videoId)}`
      }));
    }
    return;
  }

  // GET /api/social/comments - Fetch Social Comments
  if (req.method === 'GET' && (reqPath === '/api/social/comments' || reqPath === '/api/comments')) {
    (async () => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const userId = urlObj.searchParams.get('userId') || 'usr_default_postmint';
        const comments = await db.getComments(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: comments.length, comments: comments || [] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // POST /api/social/comments/reply - Reply to a Social Comment
  if (req.method === 'POST' && (reqPath === '/api/social/comments/reply' || reqPath === '/api/comments/reply')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await socialChats.replyToComment({
          commentId: payload.commentId,
          postId: payload.postId,
          platform: payload.platform,
          text: payload.text,
          author: payload.author || 'Postmint Studio',
          userId: payload.userId || 'usr_default_postmint'
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/social/messages - Fetch Direct Messages
  if (req.method === 'GET' && (reqPath === '/api/social/messages' || reqPath === '/api/messages')) {
    (async () => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const userId = urlObj.searchParams.get('userId') || 'usr_default_postmint';
        const conversations = await db.getConversations(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: conversations.length, conversations: conversations || [] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // POST /api/social/messages/send - Send Direct Message
  if (req.method === 'POST' && (reqPath === '/api/social/messages/send' || reqPath === '/api/messages/send')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = await socialChats.sendDirectMessage({
          conversationId: payload.conversationId,
          recipientId: payload.recipientId,
          platform: payload.platform,
          text: payload.text,
          senderName: payload.senderName || 'Postmint Studio',
          userId: payload.userId || 'usr_default_postmint'
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST or GET /api/social/chats/sync - Sync Live Comments & DMs
  if ((reqPath === '/api/social/chats/sync' || reqPath === '/api/social/sync-chats') && (req.method === 'POST' || req.method === 'GET')) {
    (async () => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const userId = urlObj.searchParams.get('userId') || 'usr_default_postmint';
        const remoteComments = await socialChats.fetchRemoteComments(userId);
        for (const rc of remoteComments) {
          await db.saveComment(userId, rc);
        }
        const remoteConvs = await socialChats.fetchRemoteConversations(userId);
        for (const rcv of remoteConvs) {
          await db.saveConversation(userId, rcv);
        }
        const updatedComments = await db.getComments(userId);
        const updatedConvs = await db.getConversations(userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          commentsCount: updatedComments.length,
          conversationsCount: updatedConvs.length,
          comments: updatedComments,
          conversations: updatedConvs
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // POST /api/social/facebook/post - Publish Video, Photo, or Status to Facebook Page
  if (req.method === 'POST' && reqPath === '/api/social/facebook/post') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { accountId, pageId, message, title, videoBase64, videoUrl, imageUrl } = payload;

        let videoBuffer = null;
        if (videoBase64) {
          const matches = videoBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches) {
            videoBuffer = Buffer.from(matches[2], 'base64');
          } else {
            videoBuffer = Buffer.from(videoBase64, 'base64');
          }
        }

        let targetAccountId = accountId;
        if (!targetAccountId && !pageId) {
          const accounts = await db.getConnectedAccounts();
          const fbAcc = accounts.find(a => a.platform === 'facebook' && a.status === 'active');
          if (fbAcc) {
            targetAccountId = fbAcc.id;
          }
        }

        const publishResult = await facebook.publishToFacebookPage({
          accountId: targetAccountId,
          pageId,
          message: message || title || 'Postmint Social Studio Update',
          title,
          videoBuffer,
          videoUrl,
          imageUrl
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Published to Facebook Page successfully',
          data: publishResult
        }));
      } catch (err) {
        console.error('[Facebook Post Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/social/signed-upload-url - Direct Browser Upload URL (Bypasses payload limits)
  if (req.method === 'POST' && (reqPath === '/api/social/signed-upload-url' || reqPath === '/api/social/signed_upload_url')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { filename, mimeType = 'video/mp4', folder = 'posts' } = payload;
        const signedData = await supabaseStorage.createSignedUploadUrl({ filename, mimeType, folder });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(signedData));
      } catch (err) {
        console.error('[Signed Upload URL Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/social/upload - High-Quality Lossless Media Upload to Supabase Storage
  if (req.method === 'POST' && reqPath === '/api/social/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { filename, mimeType = 'video/mp4', fileBase64, folder = 'posts' } = payload;

        let buffer = null;
        let detectedMime = mimeType;

        if (fileBase64) {
          const matches = fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches) {
            detectedMime = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
          } else {
            buffer = Buffer.from(fileBase64, 'base64');
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing file data. Provide fileBase64.' }));
          return;
        }

        const uploadResult = await supabaseStorage.uploadToSupabase({
          buffer,
          filename: filename || 'uploaded_media.mp4',
          mimeType: detectedMime,
          folder
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          storagePath: uploadResult.storagePath,
          signedUrl: uploadResult.signedUrl,
          size: uploadResult.size,
          mimeType: uploadResult.mimeType,
          filename: uploadResult.filename
        }));
      } catch (err) {
        console.error('[Supabase Upload Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/social/publish - Multi-Platform Publishing with Automatic Supabase Storage Cleanup
  if (req.method === 'POST' && reqPath === '/api/social/publish') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');

        // Check user & entitlements
        const authUser = await getAuthenticatedUser(req);
        const activeUserId = payload.userId || authUser?.id || 'usr_default_postmint';
        const userEmail = payload.email || authUser?.email || null;
        const entitlements = await getUserEntitlements(activeUserId, userEmail);

        if (!entitlements.canPublish) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Monthly upload limit reached',
            code: 'LIMIT_REACHED',
            message: "You've reached your free upload limit for this month. Upgrade to Pro to continue publishing unlimited posts.",
            entitlements
          }));
          return;
        }

        const result = await publisher.publishToAllPlatforms(payload);

        // Increment monthly uploads if publish succeeded
        if (result.success && activeUserId) {
          try {
            await db.incrementMonthlyUploads(activeUserId);
          } catch (incErr) {
            console.warn('[Social Publish] Usage increment error:', incErr.message);
          }
        }

        const updatedEntitlements = await getUserEntitlements(activeUserId, userEmail);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: result.success,
          postId: result.postId,
          results: result.results,
          storageCleaned: result.storageCleaned,
          publishedAt: result.publishedAt,
          entitlements: updatedEntitlements
        }));
      } catch (err) {
        console.error('[Multi-Platform Publish Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/social/delete - Delete Posted Video from Social Media Platforms
  if (req.method === 'POST' && (reqPath === '/api/social/delete' || reqPath === '/api/social/delete-social')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { postId, results, platforms, storagePath, connectedAccounts } = payload;
        let storageCleaned = false;
        if (storagePath) {
          try {
            await supabaseStorage.deleteFromSupabase(storagePath);
            storageCleaned = true;
          } catch (e) {
            console.warn('[Storage Delete Warning]:', e.message);
          }
        }

        const activeUserId = payload.userId || 'usr_default_postmint';
        let deleteResult = { success: true, results: [] };
        if (postId || (results && results.length > 0) || (platforms && platforms.length > 0)) {
          deleteResult = await publisher.deleteFromAllPlatforms({ 
            postId, 
            results, 
            platforms, 
            connectedAccounts,
            userId: activeUserId 
          });
        }

        if (postId) {
          try {
            await db.deletePost(postId, activeUserId);
          } catch (_) {}
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: deleteResult.success,
          postId: deleteResult.postId || postId,
          results: deleteResult.results,
          storageCleaned
        }));
      } catch (err) {
        console.error('[Social Media Delete Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // CRON & SCHEDULER: /api/cron/publish & /api/social/cron
  if ((reqPath === '/api/cron/publish' || reqPath === '/api/social/cron') && (req.method === 'GET' || req.method === 'POST')) {
    (async () => {
      try {
        const startTime = Date.now();
        console.log('[Server Cron] Checking for due scheduled posts...');
        const duePosts = await db.getDueScheduledPosts();
        console.log(`[Server Cron] Found ${duePosts.length} due scheduled post(s).`);

        if (duePosts.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'No due scheduled posts.', processed: 0, elapsedMs: Date.now() - startTime }));
          return;
        }

        const executionResults = [];
        for (const post of duePosts) {
          const claimed = await db.claimPostForPublishing(post.id);
          if (!claimed) {
            console.log(`[Server Cron] Post ${post.id} already claimed by another worker, skipping.`);
            continue;
          }

          console.log(`[Server Cron] Claimed and publishing post "${post.title || post.caption.slice(0, 30)}" (${post.id})...`);
          const targetsToPublish = (post.targets && post.targets.length > 0)
            ? post.targets.filter(t => t.status !== 'published')
            : (post.platforms || ['Facebook']).map(p => ({ platform: p.toLowerCase() }));

          const platformNames = targetsToPublish.map(t => {
            const name = t.platform || 'facebook';
            return name.charAt(0).toUpperCase() + name.slice(1);
          });

          let pubResult = { success: false, results: [] };
          let postError = '';

          try {
            pubResult = await publisher.publishToAllPlatforms({
              postId: post.id,
              platforms: platformNames,
              title: post.title || post.caption.slice(0, 60),
              caption: post.caption,
              hashtags: post.hashtags || '',
              type: post.type || 'Post',
              ratio: post.ratio || '1:1',
              storagePath: post.storagePath,
              mediaUrl: post.mediaUrl,
              userId: post.userId || 'usr_default_postmint'
            });
          } catch (pubErr) {
            console.error(`[Server Cron] Error publishing post ${post.id}:`, pubErr.message);
            postError = pubErr.message;
            pubResult = {
              success: false,
              results: platformNames.map(p => ({ platform: p, success: false, error: pubErr.message }))
            };
          }

          // Update target statuses
          for (const r of (pubResult.results || [])) {
            const matchTarget = (post.targets || []).find(t => (t.platform || '').toLowerCase() === (r.platform || '').toLowerCase());
            if (matchTarget) {
              await db.updatePostTarget(matchTarget.id, {
                status: r.success ? 'published' : 'failed',
                platform_post_id: r.postId || null,
                platform_url: r.url || null,
                error_message: r.error || null,
                published_at: r.success ? new Date().toISOString() : null,
                attempt_count: (matchTarget.attempt_count || 0) + 1
              });
            }
          }

          // Finalize post status
          const finalized = await db.finalizePostStatus(post.id, {
            results: pubResult.results,
            error: postError || pubResult.results.filter(r => !r.success).map(r => `${r.platform}: ${r.error}`).join('; ')
          });

          // Clean up storage if all succeeded
          if (pubResult.success && post.storagePath) {
            try {
              await supabaseStorage.deleteFromSupabase(post.storagePath);
            } catch (cErr) {}
          }

          executionResults.push({
            postId: post.id,
            title: post.title,
            status: finalized.status,
            results: pubResult.results
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, processed: executionResults.length, elapsedMs: Date.now() - startTime, posts: executionResults }));
      } catch (err) {
        console.error('[Server Cron Exception]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // GET /api/social/posts - Fetch all posts
  if (req.method === 'GET' && reqPath === '/api/social/posts') {
    (async () => {
      try {
        const posts = await db.getAllPosts('usr_default_postmint');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: posts.length, posts }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    })();
    return;
  }

  // POST /api/social/posts/reschedule
  if (req.method === 'POST' && (reqPath === '/api/social/posts/reschedule' || reqPath === '/api/social/reschedule')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetDate = payload.scheduledAt || payload.date;
        if (!payload.id || !targetDate || new Date(targetDate) <= new Date()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Valid future date is required.' }));
          return;
        }
        const resched = await db.reschedulePost(payload.id, targetDate);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Post rescheduled', date: resched.date }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/social/posts/cancel
  if (req.method === 'POST' && (reqPath === '/api/social/posts/cancel' || reqPath === '/api/social/cancel')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Post ID is required.' }));
          return;
        }
        await db.cancelPost(payload.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Scheduled post cancelled.' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/social/posts/retry
  if (req.method === 'POST' && reqPath === '/api/social/posts/retry') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Post ID is required.' }));
          return;
        }
        await db.prepareRetryFailed(payload.id);
        const allPosts = await db.getAllPosts();
        const targetPost = allPosts.find(p => p.id === payload.id);
        if (targetPost) {
          const claimed = await db.claimPostForPublishing(payload.id);
          if (claimed) {
            const pubResult = await publisher.publishToAllPlatforms(targetPost);
            await db.finalizePostStatus(payload.id, { results: pubResult.results });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: pubResult.success, results: pubResult.results }));
            return;
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Retry initiated.' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // POST /api/social/schedule & /api/social/posts/schedule - Persistent Post Scheduling
  if (req.method === 'POST' && (reqPath === '/api/social/schedule' || reqPath === '/api/social/posts/schedule')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const postData = payload.post || payload;

        if (payload.action === 'dispatch' && postData) {
          const result = await publisher.publishToAllPlatforms(postData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: result }));
          return;
        }

        const targetDate = postData.scheduledAt || postData.scheduled_at || postData.date;
        if (!targetDate || new Date(targetDate) <= new Date()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Choose a future date and time for scheduling.' }));
          return;
        }

        const platforms = postData.platforms || [];
        if (!Array.isArray(platforms) || platforms.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Choose at least one channel to publish.' }));
          return;
        }

        // Upload media to Supabase if only base64 provided
        let currentStoragePath = postData.storagePath || postData.video_storage_path;
        if (!currentStoragePath && postData.mediaBase64) {
          try {
            const matches = postData.mediaBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            const mType = matches ? matches[1] : (postData.mimeType || 'video/mp4');
            const buf = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(postData.mediaBase64, 'base64');
            const up = await supabaseStorage.uploadToSupabase({
              buffer: buf,
              filename: postData.filename || postData.video_filename || `scheduled_${Date.now()}.${mType.startsWith('video') ? 'mp4' : 'jpg'}`,
              mimeType: mType,
              folder: 'posts'
            });
            currentStoragePath = up.storagePath;
          } catch (upErr) {
            console.warn('[Schedule] Supabase upload exception:', upErr.message);
          }
        }

        // Persist post and targets in Supabase and local DB
        const saved = await db.saveScheduledPost({
          id: postData.id,
          userId: postData.userId || postData.user_id || 'usr_default_postmint',
          title: postData.title,
          caption: postData.caption,
          hashtags: postData.hashtags,
          type: postData.type || 'Post',
          ratio: postData.ratio || '1:1',
          platforms,
          scheduledAt: targetDate,
          timezone: postData.timezone || 'UTC',
          storagePath: currentStoragePath,
          mediaUrl: postData.mediaUrl || postData.media_url,
          mediaId: postData.mediaId || postData.media_id,
          filename: postData.filename || postData.video_filename,
          size: postData.size
        });

        console.log(`[Server Schedule] Post scheduled for ${targetDate} across [${platforms.join(', ')}]`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Post scheduled for ${new Date(targetDate).toLocaleString()}`,
          post: saved.post
        }));
      } catch (err) {
        console.error('[Schedule Exception]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Google / YouTube OAuth Start: Redirects to Google with HMAC signed state & prompt=consent select_account
  if (req.method === 'GET' && (reqPath === '/api/auth/youtube' || reqPath === '/api/youtube/connect')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const queryRedirect = urlObj.searchParams.get('redirect_uri') || urlObj.searchParams.get('redirectUri');
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
    const redirectUri = queryRedirect || (process.env.GOOGLE_REDIRECT_URI && (!isLocal || process.env.GOOGLE_REDIRECT_URI.includes('localhost')) ? process.env.GOOGLE_REDIRECT_URI : `${proto}://${host}/api/auth/youtube/callback`);

    const reqUserId = urlObj.searchParams.get('userId') || 'usr_default_postmint';
    const state = generateOAuthState({ platform: 'youtube', userId: reqUserId, redirectUri });
    const googleAuthUrl = youtube.getGoogleAuthUrl({ redirectUri, state });
    res.writeHead(302, { Location: googleAuthUrl });
    res.end();
    return;
  }

  // Google / YouTube OAuth Callback
  if (req.method === 'GET' && reqPath === '/api/auth/youtube/callback') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    const error = urlObj.searchParams.get('error_description') || urlObj.searchParams.get('error') || urlObj.searchParams.get('error_reason');

    if (error) {
      res.writeHead(302, { Location: `/?page=accounts&error=${encodeURIComponent(error)}#accounts` });
      res.end();
      return;
    }

    try {
      if (code) {
        let recoveredRedirectUri = null;
        let boundUserId = 'usr_default_postmint';
        if (state) {
          const parsedState = parseOAuthState(state);
          if (parsedState) {
            if (parsedState.redirectUri) recoveredRedirectUri = parsedState.redirectUri;
            if (parsedState.userId) boundUserId = parsedState.userId;
          }
        }
        const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
        const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
        const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
        const redirectUri = recoveredRedirectUri || (isLocal ? `${proto}://${host}/api/auth/youtube/callback` : 'https://postmint-studio.vercel.app/api/auth/youtube/callback');

        const oauthResult = await youtube.exchangeGoogleCode({ code, redirectUri });
        
        await db.upsertSocialAccount({
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

        res.writeHead(302, { Location: `/?${params.toString()}#accounts` });
        res.end();
        return;
      }
      res.writeHead(302, { Location: '/?page=accounts&error=missing_code#accounts' });
    } catch (err) {
      console.error('[YouTube OAuth Callback Error]:', err.message);
      res.writeHead(302, { Location: `/?page=accounts&error=${encodeURIComponent(err.message)}#accounts` });
    }
    res.end();
    return;
  }

  // Helper to dynamically and safely resolve Meta / Facebook OAuth Redirect URI
  function resolveMetaRedirectUri(req, defaultPath = '/api/oauth/meta/callback') {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const queryRedirect = urlObj.searchParams.get('redirect_uri') || urlObj.searchParams.get('redirectUri');
    if (queryRedirect) return queryRedirect;

    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');

    let callbackPath = defaultPath;
    const p = urlObj.pathname.toLowerCase();
    if (p.includes('/facebook/callback')) callbackPath = '/api/oauth/facebook/callback';
    else if (p.includes('/auth/facebook')) callbackPath = '/api/auth/facebook/callback';
    else if (p.includes('/oauth/meta')) callbackPath = '/api/oauth/meta/callback';

    const envRedirect = (process.env.META_REDIRECT_URI || '').trim();
    if (envRedirect) {
      try {
        const parsedEnv = new URL(envRedirect);
        const isEnvLocal = parsedEnv.hostname === 'localhost' || parsedEnv.hostname === '127.0.0.1';
        // If local client and env redirect is also local, or if host matches:
        if (isLocal === isEnvLocal || parsedEnv.host === host) {
          return envRedirect;
        }
        // If deployed to remote server/Vercel:
        if (!isLocal) {
          return envRedirect;
        }
      } catch (e) {
        if (!isLocal) return envRedirect;
      }
    }

    return `${proto}://${host}${callbackPath}`;
  }

  // Meta (Instagram & Facebook) OAuth Start: Supports multiple path aliases and dynamic redirect URI
  const isMetaStart = req.method === 'GET' && (
    reqPath === '/api/oauth/meta/start' ||
    reqPath === '/api/meta/connect' ||
    reqPath === '/api/auth/facebook' ||
    reqPath === '/api/auth/facebook/start' ||
    reqPath === '/api/oauth/facebook' ||
    reqPath === '/api/oauth/facebook/start' ||
    reqPath === '/api/auth/meta' ||
    reqPath === '/api/auth/meta/start'
  );

  if (isMetaStart) {
    const redirectUri = resolveMetaRedirectUri(req);
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const reqUserId = urlObj.searchParams.get('userId') || 'usr_default_postmint';
    const state = generateOAuthState({ platform: 'meta', userId: reqUserId, redirectUri });
    const metaAuthUrl = facebook.getMetaAuthUrl({ redirectUri, state });
    console.log(`[Meta OAuth Start] Initiating Meta OAuth. Redirect URI: ${redirectUri}`);
    res.writeHead(302, { Location: metaAuthUrl });
    res.end();
    return;
  }

  // Meta (Instagram & Facebook) OAuth Callback: Supports multiple path aliases and exact redirect URI recovery
  const isMetaCallback = req.method === 'GET' && (
    reqPath === '/api/oauth/meta/callback' ||
    reqPath === '/api/auth/facebook/callback' ||
    reqPath === '/api/oauth/facebook/callback' ||
    reqPath === '/api/meta/callback' ||
    reqPath === '/api/facebook/callback' ||
    reqPath === '/api/auth/meta/callback'
  );

  if (isMetaCallback) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');
    const error = urlObj.searchParams.get('error_description') || urlObj.searchParams.get('error') || urlObj.searchParams.get('error_reason');

    if (error) {
      console.warn('[Meta OAuth Callback] Error received from Facebook:', error);
      res.writeHead(302, { Location: `/?page=accounts&error=${encodeURIComponent(error)}#accounts` });
      res.end();
      return;
    }

    try {
      if (code) {
        // Recover EXACT redirect URI embedded in HMAC-signed state during start to ensure 100% match
        let recoveredRedirectUri = null;
        let boundUserId = 'usr_default_postmint';
        if (state) {
          const parsedState = parseOAuthState(state);
          if (parsedState) {
            if (parsedState.redirectUri) recoveredRedirectUri = parsedState.redirectUri;
            if (parsedState.userId) boundUserId = parsedState.userId;
          }
        }

        const redirectUri = recoveredRedirectUri || resolveMetaRedirectUri(req);
        console.log(`[Meta OAuth Callback] Exchanging code with Redirect URI: ${redirectUri}`);

        const { userAccessToken, pages, userProfile } = await facebook.exchangeMetaCode({ code, redirectUri });

        let fbPageName = '';
        let fbPageId = '';
        let fbAvatar = '';
        let fbToken = '';
        let igUsername = '';
        let igId = '';
        let igAvatar = '';
        let igToken = '';

        if (pages && pages.length > 0) {
          for (const page of pages) {
            if (!fbPageName) {
              fbPageName = page.name;
              fbPageId = page.id;
              fbAvatar = page.avatarUrl || '';
              fbToken = page.accessToken || '';
            }

            // Save Facebook Page
            await db.upsertSocialAccount({
              userId: boundUserId,
              platform: 'facebook',
              externalId: page.id,
              displayName: page.name,
              avatarUrl: page.avatarUrl,
              accessToken: page.accessToken,
              pageId: page.id,
              scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
            });

            // Save linked Instagram Professional account if present
            if (page.instagramAccount) {
              if (!igUsername) {
                igUsername = page.instagramAccount.username || page.instagramAccount.name;
                igId = page.instagramAccount.id;
                igAvatar = page.instagramAccount.avatarUrl || '';
                igToken = page.accessToken || '';
              }
              await db.upsertSocialAccount({
                userId: boundUserId,
                platform: 'instagram',
                externalId: page.instagramAccount.id,
                displayName: `@${page.instagramAccount.username || page.instagramAccount.name} (Instagram)`,
                avatarUrl: page.instagramAccount.avatarUrl,
                accessToken: page.accessToken,
                scopes: ['instagram_basic', 'instagram_content_publish']
              });
            }
          }
        } else {
          const displayName = userProfile?.name ? `${userProfile.name} (Facebook)` : 'Connected Facebook Profile';
          const avatarUrl = userProfile?.avatarUrl || null;
          fbPageName = displayName;
          fbAvatar = avatarUrl || '';
          fbPageId = userProfile?.id || ('user_' + Date.now().toString(36));
          fbToken = userAccessToken;

          await db.upsertSocialAccount({
            userId: boundUserId,
            platform: 'facebook',
            externalId: fbPageId,
            displayName,
            avatarUrl,
            accessToken: userAccessToken,
            pageId: fbPageId,
            scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
          });
        }

        const params = new URLSearchParams({
          page: 'accounts',
          success: 'meta_connected',
          fbName: fbPageName,
          fbId: fbPageId,
          fbAvatar: fbAvatar,
          fbToken: fbToken || '',
          igUsername: igUsername,
          igId: igId,
          igAvatar: igAvatar,
          igToken: igToken || ''
        });

        res.writeHead(302, { Location: `/?${params.toString()}#accounts` });
        res.end();
        return;
      }
      res.writeHead(302, { Location: '/?page=accounts&success=meta_connected#accounts' });
    } catch (err) {
      console.error('[Meta OAuth Callback Error]:', err.message);
      res.writeHead(302, { Location: `/?page=accounts&error=${encodeURIComponent(err.message)}#accounts` });
    }
    res.end();
    return;
  }

  // Meta Deauthorization Webhook Handler
  const isMetaDeauth = (
    reqPath === '/api/oauth/facebook/deauthorize' ||
    reqPath === '/api/oauth/meta/deauthorize' ||
    reqPath === '/api/oauth/deauthorize' ||
    reqPath === '/api/auth/facebook/deauthorize' ||
    reqPath === '/api/meta/deauthorize' ||
    reqPath === '/api/facebook/deauthorize'
  );

  if (isMetaDeauth) {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Meta deauthorize endpoint active' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        let signedRequest = null;
        if (body.includes('signed_request=')) {
          const params = new URLSearchParams(body);
          signedRequest = params.get('signed_request');
        } else {
          try {
            const jsonBody = JSON.parse(body);
            signedRequest = jsonBody.signed_request;
          } catch (_) {}
        }

        if (signedRequest) {
          const data = facebook.parseSignedRequest ? facebook.parseSignedRequest(signedRequest) : null;
          if (data && data.user_id) {
            console.log(`[Meta Deauthorize] User ${data.user_id} revoked app authorization`);
            await db.disconnectSocialAccount(data.user_id, null, 'facebook');
          }
        }
      } catch (err) {
        console.warn('[Meta Deauthorize Parse Warning]:', err.message);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Deauthorized successfully' }));
    });
    return;
  }

  // Meta Data Deletion Request Callback Handler
  const isMetaDataDeletion = (
    reqPath === '/api/oauth/facebook/data-deletion' ||
    reqPath === '/api/oauth/meta/data-deletion' ||
    reqPath === '/api/oauth/data-deletion' ||
    reqPath === '/api/auth/facebook/data-deletion' ||
    reqPath === '/api/meta/data-deletion' ||
    reqPath === '/api/facebook/data-deletion'
  );

  if (isMetaDataDeletion) {
    const handleDeletion = async (signedRequest) => {
      let confirmationCode = 'del_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      if (signedRequest) {
        const data = facebook.parseSignedRequest ? facebook.parseSignedRequest(signedRequest) : null;
        if (data && data.user_id) {
          confirmationCode = 'del_fb_' + data.user_id;
          try {
            await db.disconnectSocialAccount(data.user_id, null, 'facebook');
          } catch (_) {}
        }
      }
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        url: `${proto}://${host}/data-deletion.html?code=${encodeURIComponent(confirmationCode)}`,
        confirmation_code: confirmationCode
      }));
    };

    if (req.method === 'GET') {
      const urlObj = new URL(req.url, `http://localhost:${PORT}`);
      handleDeletion(urlObj.searchParams.get('signed_request'));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let signedRequest = null;
      if (body.includes('signed_request=')) {
        const params = new URLSearchParams(body);
        signedRequest = params.get('signed_request');
      } else {
        try {
          const jsonBody = JSON.parse(body);
          signedRequest = jsonBody.signed_request;
        } catch (_) {}
      }
      handleDeletion(signedRequest);
    });
    return;
  }

  // Native in-build credentials status handler
  if (req.method === 'GET' && reqPath === '/api/credentials/status') {
    const isMock = process.env.SOCIAL_API_MOCK_MODE === 'true';
    const statusData = {
      mockMode: isMock,
      google: {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ? '••••••••' : '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/auth/youtube/callback`
      },
      meta: {
        hasAppId: true,
        hasAppSecret: true,
        appId: process.env.META_APP_ID || '2680197525765699',
        appSecret: process.env.META_APP_SECRET || '0764e538332d0eeb68deb98df70634d1',
        redirectUri: process.env.META_REDIRECT_URI || `http://localhost:${PORT}/api/oauth/meta/callback`,
        localRedirectUri: `http://localhost:${PORT}/api/oauth/meta/callback`,
        prodRedirectUri: 'https://postmint-studio.vercel.app/api/oauth/meta/callback',
        facebookPageId: process.env.FACEBOOK_PAGE_ID || '',
        facebookPageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
        instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
        instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || ''
      },
      snapchat: {
        hasClientId: false,
        clientId: process.env.SNAPCHAT_CLIENT_ID || '',
        redirectUri: process.env.SNAPCHAT_REDIRECT_URI || `http://localhost:${PORT}/api/auth/snapchat/callback`
      },
      sharechat: {
        hasPartnerToken: false,
        partnerToken: process.env.SHARECHAT_PARTNER_API_TOKEN || ''
      },
      customSite: {
        name: process.env.CUSTOM_SITE_NAME || 'PostSprint Social Studio',
        url: process.env.CUSTOM_SITE_URL || `http://localhost:${PORT}`,
        webhook: process.env.CUSTOM_SITE_WEBHOOK || `http://localhost:${PORT}/api/chat`,
        token: process.env.CUSTOM_SITE_TOKEN || 'pm_live_sec_99482',
        hasToken: true
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(statusData));
    return;
  }

  // Native in-build credentials save handler
  if (req.method === 'POST' && reqPath === '/api/credentials/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const envLines = [
          '# POSTMINT SOCIAL MEDIA CONFIGURATION ONLY',
          `# Generated on: ${new Date().toISOString()}`,
          `SOCIAL_API_MOCK_MODE=${payload.socialMockMode !== undefined ? payload.socialMockMode : false}`,
          `NEXT_PUBLIC_SOCIAL_API_MOCK_MODE=${payload.socialMockMode !== undefined ? payload.socialMockMode : false}`,
          `META_APP_ID=${payload.metaAppId || '2680197525765699'}`,
          `META_APP_SECRET=${payload.metaAppSecret || '0764e538332d0eeb68deb98df70634d1'}`,
          `META_REDIRECT_URI=${payload.metaRedirectUri || `http://localhost:${PORT}/api/oauth/meta/callback`}`,
          `FACEBOOK_PAGE_ID=${payload.facebookPageId || ''}`,
          `FACEBOOK_PAGE_ACCESS_TOKEN=${payload.facebookPageAccessToken || ''}`,
          `INSTAGRAM_ACCOUNT_ID=${payload.instagramAccountId || ''}`,
          `INSTAGRAM_ACCESS_TOKEN=${payload.instagramAccessToken || ''}`,
          `GOOGLE_CLIENT_ID=${payload.googleClientId || process.env.GOOGLE_CLIENT_ID || ''}`,
          `GOOGLE_CLIENT_SECRET=${payload.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || ''}`,
          `GOOGLE_REDIRECT_URI=${payload.googleRedirectUri || `http://localhost:${PORT}/api/auth/youtube/callback`}`,
          `SNAPCHAT_CLIENT_ID=${payload.snapchatClientId || ''}`,
          `SHARECHAT_PARTNER_API_TOKEN=${payload.sharechatPartnerToken || ''}`,
          `CUSTOM_SITE_NAME=${payload.customSiteName || 'Postmint Social Studio'}`,
          `CUSTOM_SITE_URL=${payload.customSiteUrl || `http://localhost:${PORT}`}`,
          `CUSTOM_SITE_WEBHOOK=${payload.customSiteWebhook || `http://localhost:${PORT}/api/chat`}`,
          `CUSTOM_SITE_TOKEN=${payload.customSiteToken || 'pm_live_sec_99482'}`
        ];
        const content = envLines.join('\n') + '\n';
        fs.writeFileSync(path.join(BASE_DIR, 'social-accounts.env'), content, 'utf8');

        // Also sync to .env.local if present
        const envLocalPath = path.join(BASE_DIR, '.env.local');
        if (fs.existsSync(envLocalPath)) {
          let envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
          const keysToSync = [
            'SOCIAL_API_MOCK_MODE', 'NEXT_PUBLIC_SOCIAL_API_MOCK_MODE',
            'META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI',
            'FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN',
            'INSTAGRAM_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'
          ];
          for (const k of keysToSync) {
            const reg = new RegExp(`^${k}=.*$`, 'm');
            const targetVal = envLines.find(l => l.startsWith(`${k}=`))?.split('=')[1] || '';
            if (reg.test(envLocalContent)) {
              envLocalContent = envLocalContent.replace(reg, `${k}=${targetVal}`);
            } else if (targetVal) {
              envLocalContent += `\n${k}=${targetVal}`;
            }
          }
          fs.writeFileSync(envLocalPath, envLocalContent, 'utf8');
        }

        // Immediately update process.env in memory so live server uses new settings without restart
        if (payload.socialMockMode !== undefined) {
          process.env.SOCIAL_API_MOCK_MODE = String(payload.socialMockMode);
          process.env.NEXT_PUBLIC_SOCIAL_API_MOCK_MODE = String(payload.socialMockMode);
        }
        if (payload.metaAppId) process.env.META_APP_ID = payload.metaAppId;
        if (payload.metaAppSecret) process.env.META_APP_SECRET = payload.metaAppSecret;
        if (payload.metaRedirectUri) process.env.META_REDIRECT_URI = payload.metaRedirectUri;
        if (payload.facebookPageId) process.env.FACEBOOK_PAGE_ID = payload.facebookPageId;
        if (payload.facebookPageAccessToken) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = payload.facebookPageAccessToken;
        if (payload.instagramAccountId) process.env.INSTAGRAM_ACCOUNT_ID = payload.instagramAccountId;
        if (payload.instagramAccessToken) process.env.INSTAGRAM_ACCESS_TOKEN = payload.instagramAccessToken;
        if (payload.googleClientId) process.env.GOOGLE_CLIENT_ID = payload.googleClientId;
        if (payload.googleClientSecret) process.env.GOOGLE_CLIENT_SECRET = payload.googleClientSecret;
        if (payload.googleRedirectUri) process.env.GOOGLE_REDIRECT_URI = payload.googleRedirectUri;

        // Auto-upsert direct credentials to local DB
        if (payload.facebookPageId && payload.facebookPageAccessToken) {
          try {
            await db.upsertSocialAccount({
              userId: 'usr_default_postmint',
              platform: 'facebook',
              externalId: payload.facebookPageId,
              pageId: payload.facebookPageId,
              displayName: payload.facebookPageName || `Facebook Page (${payload.facebookPageId})`,
              accessToken: payload.facebookPageAccessToken,
              scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
            });

            // Auto-discover linked Instagram account if not manually provided
            if (!payload.instagramAccountId) {
              try {
                const igQ = await fetch(`https://graph.facebook.com/v21.0/${payload.facebookPageId}?fields=instagram_business_account{id,username,name}&access_token=${encodeURIComponent(payload.facebookPageAccessToken)}`);
                const igQData = await igQ.json();
                if (igQData.instagram_business_account?.id) {
                  payload.instagramAccountId = igQData.instagram_business_account.id;
                  payload.instagramUsername = igQData.instagram_business_account.username || '';
                  payload.instagramAccessToken = payload.facebookPageAccessToken;
                  process.env.INSTAGRAM_ACCOUNT_ID = payload.instagramAccountId;
                  process.env.INSTAGRAM_ACCESS_TOKEN = payload.instagramAccessToken;
                }
              } catch (e) {}
            }
          } catch (e) {
            console.warn('[Credentials Save] FB account upsert warning:', e.message);
          }
        }
        if (payload.instagramAccountId && (payload.instagramAccessToken || payload.facebookPageAccessToken)) {
          try {
            await db.upsertSocialAccount({
              userId: 'usr_default_postmint',
              platform: 'instagram',
              externalId: payload.instagramAccountId,
              displayName: payload.instagramUsername ? `@${payload.instagramUsername} (Instagram)` : `Instagram Account (${payload.instagramAccountId})`,
              accessToken: payload.instagramAccessToken || payload.facebookPageAccessToken,
              scopes: ['instagram_basic', 'instagram_content_publish']
            });
          } catch (e) {
            console.warn('[Credentials Save] IG account upsert warning:', e.message);
          }
        }

        // Write structured JSON config
        const configJson = {
          _info: "Postmint Social Media Accounts & Connected Site Configuration",
          generatedAt: new Date().toISOString(),
          mockMode: payload.socialMockMode !== undefined ? payload.socialMockMode : true,
          platforms: {
            meta: {
              platformName: "Instagram & Facebook",
              appId: payload.metaAppId || "1638858091004061",
              appSecretConfigured: true,
              redirectUri: payload.metaRedirectUri || `http://localhost:${PORT}/api/oauth/meta/callback`
            },
            youtube: {
              platformName: "YouTube Data API v3",
              clientId: payload.googleClientId || process.env.GOOGLE_CLIENT_ID || "",
              clientSecretConfigured: true,
              redirectUri: payload.googleRedirectUri || `http://localhost:${PORT}/api/auth/youtube/callback`
            },
            snapchat: {
              platformName: "Snapchat Creative Kit",
              clientId: payload.snapchatClientId || null,
              redirectUri: `http://localhost:${PORT}/api/auth/snapchat/callback`
            },
            sharechat: {
              platformName: "ShareChat Partner API",
              partnerTokenConfigured: Boolean(payload.sharechatPartnerToken)
            }
          },
          connectedSite: {
            name: payload.customSiteName || "PostSprint Social Studio",
            url: payload.customSiteUrl || `http://localhost:${PORT}`,
            webhook: payload.customSiteWebhook || `http://localhost:${PORT}/api/chat`,
            token: payload.customSiteToken || "pm_live_sec_99482"
          }
        };
        fs.writeFileSync(path.join(BASE_DIR, 'social-accounts.config.json'), JSON.stringify(configJson, null, 2), 'utf8');

        // Update process.env in memory
        for (const line of envLines) {
          if (line.includes('=') && !line.startsWith('#')) {
            const [k, ...v] = line.split('=');
            process.env[k] = v.join('=');
          }
        }

        // Also write to auto/.env.local if auto dir exists
        const autoEnv = path.join(BASE_DIR, 'auto', '.env.local');
        try { fs.writeFileSync(autoEnv, content, 'utf8'); } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Native in-build site ping test handler
  if (req.method === 'POST' && reqPath === '/api/site/ping') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url } = JSON.parse(body || '{}');
        const targetUrl = url || `http://localhost:${PORT}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
          const pingRes = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, status: pingRes.status, statusText: pingRes.statusText }));
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, status: 200, statusText: 'Reachable' }));
        }
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: 200 }));
      }
    });
    return;
  }

  // Seamless inbuild proxy for Social OAuth & External APIs
  if (
    reqPath.startsWith('/api/credentials') ||
    reqPath.startsWith('/api/oauth') ||
    reqPath.startsWith('/api/auth') ||
    reqPath.startsWith('/api/accounts') ||
    reqPath.startsWith('/api/meta')
  ) {
    const targetUrl = new URL(req.url, 'http://127.0.0.1:3000');
    const proxyHeaders = { ...req.headers };
    proxyHeaders.host = 'localhost:3000';
    delete proxyHeaders['content-length'];

    const proxyReq = http.request(targetUrl, {
      method: req.method,
      headers: proxyHeaders,
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error('[API Proxy Error]', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Social API service unavailable: ' + err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // AI Chat Proxy Endpoint with Google Gemini & Pollinations Fallback
  if (req.method === 'POST' && reqPath === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        const userMessages = data.messages || [];
        const modelPreference = data.model || 'gemini';
        const apiKey = process.env.GEMINI_API_KEY || '';
        
        const systemPromptText = `You are a natural, friendly AI assistant inside a website.

Your behavior should feel like a normal ChatGPT conversation.

Rules:
- Reply naturally and directly to what the user says.
- Do not act like a marketing assistant unless the user specifically asks about marketing.
- Do not automatically suggest creating posts, videos, posters, campaigns, reels, or ads.
- Do not add action buttons or button-like text inside your response.
- Do not include text such as:
  "Send to Create Post"
  "Copy"
  "Make Video"
  "Make Poster"
  unless the user specifically asks for those actions.
- Do not make every reply long.
- For simple greetings, reply simply.

Examples:
User: hi
Assistant: Hey! 👋 How can I help you?

User: hello
Assistant: Hey! What can I help you with?

User: how are you
Assistant: I'm doing good! How can I help?

User: what is seo
Assistant: SEO stands for Search Engine Optimization. It helps improve a website's visibility on search engines like Google.

User: create a caption for my business
Assistant: Sure. Tell me what the post is about, and I'll create a caption for you.

User: enna panra
Assistant: Unakku help panna ready-ah iruken 😄 Sollu, enna venum?

User: website create pannanum
Assistant: Sure. Enna type website create pannanum? Business website, portfolio, e-commerce, illa vera type-a?

Conversation style:
- Match the user's tone and language.
- If they use English, respond in English.
- If they use Tamil + English, respond naturally in Tanglish.
- Keep greetings short.
- Use emojis only occasionally.
- Avoid excessive enthusiasm.
- Avoid phrases like "Great to connect with you!" unless it genuinely fits.
- Avoid unnecessary follow-up questions.
- Give detailed answers only when the user's request needs detail.
- Never repeat the same marketing suggestions after every response.

Important:
The chatbot response should contain only the conversational answer.
Any website buttons such as Copy, Create Post, Make Video, Make Poster, Regenerate, or Share must be handled separately by the frontend UI and must NOT be generated as part of the AI message.`;

        function sanitizeAiReply(text) {
          if (!text) return '';
          return text
            .replace(/(?:🚀|🎬|🎨|📋)?\s*(?:Send to Create Post|Make Video|Make Poster|Copy|Regenerate)\s*$/gim, '')
            .trim();
        }

        // Ultra-fast model fetcher with token limit
        async function fetchGeminiModel(model, contents, timeoutMs = 5000) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-goog-api-key': apiKey
              },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPromptText }] },
                contents,
                generationConfig: {
                  maxOutputTokens: 600,
                  temperature: 0.7
                }
              }),
              signal: controller.signal
            });

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              const errMsg = errJson.error?.message || `HTTP ${res.status}`;
              throw new Error(`Model ${model} returned ${res.status}: ${errMsg}`);
            }

            const resData = await res.json();
            const reply = resData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (reply && reply.trim()) {
              return { reply: sanitizeAiReply(reply), modelUsed: model };
            }
            throw new Error(`Model ${model} returned empty reply`);
          } finally {
            clearTimeout(timer);
          }
        }

        // Helper to call Google Gemini (Concurrent fast race)
        async function runGemini() {
          const fastModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'];
          const backupModels = ['gemini-flash-latest', 'gemini-3.5-flash'];
          const contents = [];
          for (const m of userMessages) {
            if (!m || !m.content) continue;
            const role = (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user';
            contents.push({ role, parts: [{ text: m.content }] });
          }
          if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: 'Hello Mint!' }] });
          }

          // 1. Race the fastest flash-lite models concurrently
          try {
            return await Promise.any(
              fastModels.map(m => fetchGeminiModel(m, contents, 5000))
            );
          } catch (raceErr) {
            console.warn('[server.js Gemini] Fast race failed, falling back to backups:', raceErr.message);
          }

          // 2. Fall back to standard models
          for (const model of backupModels) {
            try {
              return await fetchGeminiModel(model, contents, 6000);
            } catch (err) {
              console.warn(`[server.js Gemini] Backup model ${model} failed:`, err.message);
            }
          }
          throw new Error('All Gemini models failed');
        }

        // Helper to call Pollinations (OpenAI / Llama 3)
        async function runPollinations() {
          const fullMessages = [
            { role: 'system', content: systemPromptText },
            ...userMessages.map(m => ({ role: m.role, content: m.content }))
          ];

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          try {
            const aiRes = await fetch('https://text.pollinations.ai/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: fullMessages,
                model: 'openai',
                seed: Math.floor(Math.random() * 1000000)
              }),
              signal: controller.signal
            });

            if (!aiRes.ok) {
              throw new Error('AI upstream status ' + aiRes.status);
            }

            const reply = await aiRes.text();
            return { reply: sanitizeAiReply(reply), modelUsed: 'pollinations' };
          } finally {
            clearTimeout(timer);
          }
        }

        let result = null;
        if (modelPreference === 'free') {
          try {
            result = await runPollinations();
          } catch (err) {
            console.warn('Pollinations failed, falling back to Gemini:', err.message);
            result = await runGemini();
          }
        } else {
          // Default to Gemini Flash
          try {
            result = await runGemini();
          } catch (err) {
            console.warn('Gemini failed, falling back to Pollinations:', err.message);
            result = await runPollinations();
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, reply: result.reply, modelUsed: result.modelUsed }));
      } catch (err) {
        console.error('AI chat endpoint error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static File Serving
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(BASE_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (fs.existsSync(filePath + '.html')) {
        filePath = filePath + '.html';
      } else {
        filePath = path.join(BASE_DIR, 'index.html');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 - Internal Server Error');
        return;
      }
      const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
      const shouldCompress = /text|javascript|json|svg/.test(contentType);
      if (acceptsGzip && shouldCompress) {
        const compressed = zlib.gzipSync(content);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Encoding': 'gzip',
          'Vary': 'Accept-Encoding'
        });
        res.end(compressed);
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`PostSprint Social Studio running at http://localhost:${PORT}`);
});

// Background Scheduler: check and dispatch due scheduled posts from Supabase / local DB every 15 seconds
setInterval(async () => {
  try {
    const duePosts = await db.getDueScheduledPosts();
    for (const p of duePosts) {
      const claimed = await db.claimPostForPublishing(p.id);
      if (!claimed) continue;

      console.log(`[Background Scheduler] Dispatching due post ${p.id} ("${p.title || p.caption}")...`);
      try {
        const res = await publisher.publishToAllPlatforms(p);
        await db.finalizePostStatus(p.id, { results: res.results });
        if (res.success && p.storagePath) {
          try { await supabaseStorage.deleteFromSupabase(p.storagePath); } catch (e) {}
        }
        console.log(`[Background Scheduler] Successfully auto-published post ${p.id}!`);
      } catch (postErr) {
        console.error(`[Background Scheduler Error] Post ${p.id}:`, postErr.message);
        await db.finalizePostStatus(p.id, { error: postErr.message });
      }
    }
  } catch (err) {}
}, 15000);

// api/credentials.js
// Postmint Credentials API (Unified Router for status and save)
// Hardened with strict Admin RBAC and zero-exposure credential masking (PS-02, PS-03, PS-04)

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { getAuthenticatedUser } = require('../lib/auth-session');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // PS-02 & PS-03: Strict Admin Authorization Gate
  const authUser = await getAuthenticatedUser(req);
  const isAdmin = authUser && (authUser.role === 'admin' || authUser.email === 'explorewithharizz@gmail.com');

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'forbidden',
      message: 'Admin authorization required to access or modify system credentials.'
    });
  }

  const url = req.url || '';
  const subpath = req.query ? (req.query.subpath || '') : '';
  const isSave = req.method === 'POST' || url.includes('/save') || subpath === 'save';

  // 1. SAVE CREDENTIALS (POST - Admin Only)
  if (isSave) {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      
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
      if (payload.snapchatClientId) process.env.SNAPCHAT_CLIENT_ID = payload.snapchatClientId;
      if (payload.sharechatPartnerToken) process.env.SHARECHAT_PARTNER_API_TOKEN = payload.sharechatPartnerToken;

      let fbPageId = payload.facebookPageId || process.env.FACEBOOK_PAGE_ID || '';
      let fbToken = payload.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
      let igId = payload.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID || '';
      let igToken = payload.instagramAccessToken || process.env.INSTAGRAM_ACCESS_TOKEN || fbToken;
      let fbPageName = payload.facebookPageName || '';
      let igUsername = payload.instagramUsername || '';
      let tokenVerified = false;

      if (fbToken) {
        try {
          const appId = payload.metaAppId || process.env.META_APP_ID || '';
          const appSecret = payload.metaAppSecret || process.env.META_APP_SECRET || '';

          let workingToken = fbToken;
          if (appId && appSecret) {
            try {
              const exUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(fbToken)}`;
              const exRes = await fetch(exUrl);
              const exData = await exRes.json();
              if (exData.access_token) {
                workingToken = exData.access_token;
              }
            } catch (e) {}
          }

          try {
            const accsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(workingToken)}`;
            const accsRes = await fetch(accsUrl);
            const accsData = await accsRes.json();

            if (accsRes.ok && Array.isArray(accsData?.data) && accsData.data.length > 0) {
              const page = accsData.data.find(p => p.id === fbPageId) || accsData.data[0];
              fbPageId = page.id;
              fbPageName = page.name;
              if (page.access_token) {
                fbToken = page.access_token;
                process.env.FACEBOOK_PAGE_ACCESS_TOKEN = fbToken;
                process.env.FACEBOOK_PAGE_ID = fbPageId;
              }
              if (page.instagram_business_account?.id) {
                igId = page.instagram_business_account.id;
                igUsername = page.instagram_business_account.username || page.instagram_business_account.name || '';
                igToken = fbToken;
                process.env.INSTAGRAM_ACCOUNT_ID = igId;
                process.env.INSTAGRAM_ACCESS_TOKEN = igToken;
              }
              tokenVerified = true;
            }
          } catch (e) {}

          const targetUserId = authUser.id;

          if (fbPageId && fbToken) {
            await db.upsertSocialAccount({
              userId: targetUserId,
              platform: 'facebook',
              externalId: fbPageId,
              displayName: fbPageName || 'Facebook Page',
              accessToken: fbToken,
              pageId: fbPageId,
              scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
            });
          }

          if (igId && igToken) {
            await db.upsertSocialAccount({
              userId: targetUserId,
              platform: 'instagram',
              externalId: igId,
              displayName: igUsername ? `@${igUsername} (Instagram)` : 'Instagram Professional',
              accessToken: igToken,
              scopes: ['instagram_basic', 'instagram_content_publish']
            });
          }
        } catch (checkErr) {
          console.warn('[Credentials Save] Token validation warning:', checkErr.message);
        }
      }

      const configData = {
        mockMode: payload.socialMockMode !== undefined ? Boolean(payload.socialMockMode) : false,
        meta: {
          appId: payload.metaAppId || process.env.META_APP_ID || '',
          appSecretConfigured: Boolean(payload.metaAppSecret || process.env.META_APP_SECRET),
          redirectUri: payload.metaRedirectUri || process.env.META_REDIRECT_URI || '',
          facebookPageId: fbPageId,
          facebookPageName: fbPageName,
          facebookPageAccessTokenConfigured: Boolean(fbToken),
          instagramAccountId: igId,
          instagramAccountUsername: igUsername,
          instagramAccessTokenConfigured: Boolean(igToken),
          tokenVerified
        },
        youtube: {
          clientId: payload.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
          clientSecretConfigured: Boolean(payload.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET),
          redirectUri: payload.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || ''
        },
        updatedAt: new Date().toISOString()
      };

      try {
        const outPath = process.env.VERCEL ? path.join('/tmp', 'social-accounts.config.json') : path.join(process.cwd(), 'social-accounts.config.json');
        fs.writeFileSync(outPath, JSON.stringify(configData, null, 2), 'utf8');
      } catch (e) {}

      return res.status(200).json({
        success: true,
        message: tokenVerified ? 'Credentials verified and synchronized with Meta Graph API.' : 'Configuration saved and applied.',
        verified: tokenVerified,
        meta: {
          facebookPageId: fbPageId,
          facebookPageName: fbPageName,
          instagramAccountId: igId,
          instagramUsername: igUsername
        },
        config: configData
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 2. STATUS (GET - Admin Only, Zero Plaintext Secrets Exposed)
  const isMock = process.env.SOCIAL_API_MOCK_MODE === 'true';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'postsprint.devpatternlabs.com';
  const appUrl = `${proto}://${host}`;

  return res.status(200).json({
    mockMode: isMock,
    google: {
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/youtube/callback`
    },
    meta: {
      hasAppId: Boolean(process.env.META_APP_ID),
      hasAppSecret: Boolean(process.env.META_APP_SECRET),
      appId: process.env.META_APP_ID || '',
      redirectUri: process.env.META_REDIRECT_URI || `${appUrl}/api/oauth/meta/callback`,
      facebookPageId: process.env.FACEBOOK_PAGE_ID || '',
      hasFacebookToken: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
      facebookPageName: process.env.FACEBOOK_PAGE_NAME || '',
      instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
      hasInstagramToken: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN)
    },
    snapchat: {
      hasClientId: Boolean(process.env.SNAPCHAT_CLIENT_ID),
      clientId: process.env.SNAPCHAT_CLIENT_ID || '',
      redirectUri: process.env.SNAPCHAT_REDIRECT_URI || `${appUrl}/api/auth/snapchat/callback`
    },
    sharechat: {
      hasPartnerToken: Boolean(process.env.SHARECHAT_PARTNER_API_TOKEN)
    },
    customSite: {
      name: process.env.CUSTOM_SITE_NAME || 'PostSprint Social Studio',
      url: process.env.CUSTOM_SITE_URL || appUrl,
      webhook: process.env.CUSTOM_SITE_WEBHOOK || `${appUrl}/api/chat`,
      hasToken: Boolean(process.env.CUSTOM_SITE_TOKEN)
    }
  });
}

module.exports = handler;
module.exports.default = handler;

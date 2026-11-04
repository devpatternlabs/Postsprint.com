// api/oauth.js
// Postmint Meta / Social OAuth Router

const facebook = require('../lib/facebook');
const db = require('../lib/db');
const { getAuthenticatedUser } = require('../lib/auth-session');
const { generateOAuthState, parseOAuthState } = require('../lib/crypto');

function resolveMetaRedirectUri(req, defaultPath = '/api/oauth/meta/callback') {
  if (req.query && (req.query.redirect_uri || req.query.redirectUri)) {
    return req.query.redirect_uri || req.query.redirectUri;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');

  const envRedirect = (process.env.META_REDIRECT_URI || '').trim();
  if (envRedirect) {
    try {
      const parsedEnv = new URL(envRedirect);
      const isEnvLocal = parsedEnv.hostname === 'localhost' || parsedEnv.hostname === '127.0.0.1';
      if (isLocal === isEnvLocal || (host && parsedEnv.host === host)) {
        return envRedirect;
      }
      if (!isLocal) {
        return envRedirect;
      }
    } catch (e) {
      if (!isLocal) return envRedirect;
    }
  }

  const baseOrigin = host ? `${proto}://${host}` : 'https://postsprint.devpatternlabs.com';
  return `${baseOrigin}${defaultPath}`;
}

async function handler(req, res) {
  const url = req.url || '';
  const subpath = req.query ? (req.query.subpath || '') : '';
  const isDeauth = url.includes('/deauthorize') || subpath.includes('deauthorize');
  const isDataDeletion = url.includes('/data-deletion') || subpath.includes('data-deletion') || subpath.includes('deletion');

  // 1a. Meta Deauthorize Callback Handler (Webhook POST or health check GET)
  if (isDeauth) {
    let signedRequest = (req.body && req.body.signed_request) || (req.query && req.query.signed_request);
    if (!signedRequest && typeof req.body === 'string' && req.body.includes('signed_request=')) {
      const parsed = new URLSearchParams(req.body);
      signedRequest = parsed.get('signed_request');
    }
    if (signedRequest) {
      const data = facebook.parseSignedRequest ? facebook.parseSignedRequest(signedRequest) : null;
      if (data && data.user_id) {
        console.log(`[Meta Deauthorize] User ${data.user_id} revoked app authorization`);
        try {
          await db.disconnectSocialAccount(data.user_id, null, 'facebook');
        } catch (e) {
          console.warn('[Meta Deauthorize Warning]:', e.message);
        }
      }
    }
    return res.status(200).json({ success: true, message: 'Deauthorized successfully' });
  }

  // 1b. Meta Data Deletion Request Callback Handler
  if (isDataDeletion) {
    let signedRequest = (req.body && req.body.signed_request) || (req.query && req.query.signed_request);
    if (!signedRequest && typeof req.body === 'string' && req.body.includes('signed_request=')) {
      const parsed = new URLSearchParams(req.body);
      signedRequest = parsed.get('signed_request');
    }
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
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'postsprint.devpatternlabs.com';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const proto = req.headers['x-forwarded-proto'] || (isLocal ? 'http' : 'https');
    return res.status(200).json({
      url: `${proto}://${host}/data-deletion.html?code=${encodeURIComponent(confirmationCode)}`,
      confirmation_code: confirmationCode
    });
  }

  const isCallback = url.includes('/callback') || subpath.includes('callback');

  // 1c. Meta OAuth Callback Handler
  if (isCallback) {
    const code = req.query ? req.query.code : null;
    const error = req.query ? (req.query.error_description || req.query.error || req.query.error_reason) : null;
    if (error) {
      return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(error)}#accounts`);
    }

    try {
      if (code) {
        const user = await getAuthenticatedUser(req);
        const stateParam = req.query ? (req.query.state || '') : '';
        let recoveredRedirectUri = null;
        let userId = user ? user.id : null;

        let targetPlatform = 'meta';
        if (stateParam) {
          const parsed = parseOAuthState(stateParam);
          if (parsed) {
            if (parsed.redirectUri) recoveredRedirectUri = parsed.redirectUri;
            if (parsed.userId && !userId) userId = parsed.userId;
            if (parsed.targetPlatform) targetPlatform = String(parsed.targetPlatform).toLowerCase();
          } else if (stateParam.startsWith('meta_')) {
            const raw = stateParam.replace('meta_', '');
            if (raw && raw !== 'postmint' && !userId) userId = raw;
          }
        }
        if (!userId) userId = 'usr_default_postmint';

        const shouldSaveFb = targetPlatform === 'meta' || targetPlatform === 'facebook';
        const shouldSaveIg = targetPlatform === 'meta' || targetPlatform === 'instagram';

        const redirectUri = recoveredRedirectUri || resolveMetaRedirectUri(req);
        const { userAccessToken, pages, userProfile } = await facebook.exchangeMetaCode({ code, redirectUri });

        let fbPageName = '';
        let fbPageId = '';
        let fbAvatar = '';
        let igUsername = '';
        let igId = '';
        let igAvatar = '';
        let fbToken = '';
        let igToken = '';

        if (pages && pages.length > 0) {
          for (const page of pages) {
            if (shouldSaveFb) {
              if (!fbPageName) {
                fbPageName = page.name;
                fbPageId = page.id;
                fbAvatar = page.avatarUrl || '';
                fbToken = page.accessToken || '';
              }

              // Save Facebook Page
              await db.upsertSocialAccount({
                userId,
                platform: 'facebook',
                externalId: page.id,
                displayName: page.name,
                avatarUrl: page.avatarUrl,
                accessToken: page.accessToken,
                pageId: page.id,
                scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
              });
            }

            // Save linked Instagram Professional account if present
            if (shouldSaveIg && page.instagramAccount) {
              if (!igUsername) {
                igUsername = page.instagramAccount.username || page.instagramAccount.name;
                igId = page.instagramAccount.id;
                igAvatar = page.instagramAccount.avatarUrl || '';
                igToken = page.accessToken || '';
              }
              await db.upsertSocialAccount({
                userId,
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
          // Attempt fallback lookup for default Page
          let fallbackPageFound = false;
          try {
            const defaultPageId = process.env.FACEBOOK_PAGE_ID || '1399357519919142';
            const pRes = await fetch(`https://graph.facebook.com/v21.0/${defaultPageId}?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(userAccessToken)}`);
            if (pRes.ok) {
              const pData = await pRes.json();
              if (pData.id && pData.name) {
                if (shouldSaveFb) {
                  fbPageName = pData.name;
                  fbPageId = pData.id;
                  fbToken = pData.access_token || userAccessToken;
                  fallbackPageFound = true;

                  await db.upsertSocialAccount({
                    userId,
                    platform: 'facebook',
                    externalId: fbPageId,
                    displayName: fbPageName,
                    accessToken: fbToken,
                    pageId: fbPageId,
                    scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
                  });
                }

                if (shouldSaveIg && pData.instagram_business_account?.id) {
                  igId = pData.instagram_business_account.id;
                  igUsername = pData.instagram_business_account.username || pData.instagram_business_account.name || '';
                  igToken = fbToken;
                  await db.upsertSocialAccount({
                    userId,
                    platform: 'instagram',
                    externalId: igId,
                    displayName: `@${igUsername} (Instagram)`,
                    accessToken: igToken,
                    scopes: ['instagram_basic', 'instagram_content_publish']
                  });
                }
              }
            }
          } catch (e) {}

          if (!fallbackPageFound && shouldSaveFb) {
            const displayName = userProfile?.name ? `${userProfile.name} (Facebook)` : 'Connected Facebook Profile';
            const avatarUrl = userProfile?.avatarUrl || null;
            fbPageName = displayName;
            fbAvatar = avatarUrl || '';
            fbPageId = userProfile?.id || ('user_' + Date.now().toString(36));
            fbToken = userAccessToken;

            await db.upsertSocialAccount({
              userId,
              platform: 'facebook',
              externalId: fbPageId,
              displayName,
              avatarUrl,
              accessToken: userAccessToken,
              pageId: fbPageId,
              scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
            });
          }
        }

        if (fbPageId && shouldSaveFb) process.env.FACEBOOK_PAGE_ID = fbPageId;
        if (fbToken && shouldSaveFb) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = fbToken;
        if (igId && shouldSaveIg) process.env.INSTAGRAM_ACCOUNT_ID = igId;
        if (igToken && shouldSaveIg) process.env.INSTAGRAM_ACCESS_TOKEN = igToken;

        const params = new URLSearchParams({
          page: 'accounts',
          success: 'meta_connected',
          targetPlatform: targetPlatform,
          fbName: shouldSaveFb ? fbPageName : '',
          fbId: shouldSaveFb ? fbPageId : '',
          fbAvatar: shouldSaveFb ? fbAvatar : '',
          fbToken: shouldSaveFb ? fbToken : '',
          igUsername: shouldSaveIg ? igUsername : '',
          igId: shouldSaveIg ? igId : '',
          igAvatar: shouldSaveIg ? igAvatar : '',
          igToken: shouldSaveIg ? igToken : ''
        });

        return res.redirect(302, `/?${params.toString()}#accounts`);
      }
      return res.redirect(302, '/?page=accounts&success=meta_connected#accounts');
    } catch (err) {
      console.error('[Meta OAuth Callback Error]:', err.message);
      return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(err.message)}#accounts`);
    }
  }

  // 2. Meta OAuth Start Handler
  const appId = process.env.META_APP_ID || '2680197525765699';
  const scopes = (req.query && req.query.scope) || 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
  const user = await getAuthenticatedUser(req);
  const stateUserId = user ? user.id : (req.query && req.query.userId ? req.query.userId : 'usr_default_postmint');
  const targetPlatform = ((req.query && (req.query.platform || req.query.targetPlatform)) || 'meta').toLowerCase();
  const redirectUri = resolveMetaRedirectUri(req);
  const state = generateOAuthState({ platform: 'meta', targetPlatform, userId: stateUserId, redirectUri });
  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&auth_type=rerequest&state=${encodeURIComponent(state)}`;
  return res.redirect(302, authUrl);
}

module.exports = handler;
module.exports.default = handler;

const fs = require('fs');
const path = require('path');
const db = require('../../lib/db');
const facebook = require('../../lib/facebook');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    
    // Update process.env
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

    let fbPageId = payload.facebookPageId || process.env.FACEBOOK_PAGE_ID || '1399357519919142';
    let fbToken = payload.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
    let igId = payload.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID || '';
    let igToken = payload.instagramAccessToken || process.env.INSTAGRAM_ACCESS_TOKEN || fbToken;
    let fbPageName = 'Devpatternlabs';
    let igUsername = '';
    let tokenVerified = false;

    // If a Facebook token was provided, test and auto-exchange/auto-discover linked accounts
    if (fbToken) {
      try {
        const appId = payload.metaAppId || process.env.META_APP_ID || '2680197525765699';
        const appSecret = payload.metaAppSecret || process.env.META_APP_SECRET || '0764e538332d0eeb68deb98df70634d1';

        // 1. Check if token is user token and exchange for 60-day token
        let workingToken = fbToken;
        try {
          const exUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(fbToken)}`;
          const exRes = await fetch(exUrl);
          const exData = await exRes.json();
          if (exData.access_token) {
            workingToken = exData.access_token;
            console.log('[Credentials Save] Upgraded to long-lived Meta token.');
          }
        } catch (e) {}

        // 2. Query /me/accounts with workingToken to get permanent Page Access Token
        try {
          const accsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(workingToken)}`;
          const accsRes = await fetch(accsUrl);
          const accsData = await accsRes.json();

          if (accsRes.ok && Array.isArray(accsData?.data) && accsData.data.length > 0) {
            const page = accsData.data.find(p => p.id === fbPageId) || accsData.data[0];
            fbPageId = page.id;
            fbPageName = page.name;
            if (page.access_token) {
              fbToken = page.access_token; // NEVER-EXPIRING Page Access Token!
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

        // 3. Fallback: inspect direct page info
        if (!tokenVerified && fbPageId && workingToken) {
          try {
            const pUrl = `https://graph.facebook.com/v21.0/${fbPageId}?fields=name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(workingToken)}`;
            const pRes = await fetch(pUrl);
            const pData = await pRes.json();
            if (pRes.ok && pData.name) {
              fbPageName = pData.name;
              if (pData.access_token) fbToken = pData.access_token;
              if (pData.instagram_business_account?.id) {
                igId = pData.instagram_business_account.id;
                igUsername = pData.instagram_business_account.username || '';
                igToken = fbToken;
                process.env.INSTAGRAM_ACCOUNT_ID = igId;
                process.env.INSTAGRAM_ACCESS_TOKEN = igToken;
              }
              tokenVerified = true;
            }
          } catch (e) {}
        }

        // Save Facebook Page to database
        if (fbPageId && fbToken) {
          await db.upsertSocialAccount({
            platform: 'facebook',
            externalId: fbPageId,
            displayName: fbPageName,
            accessToken: fbToken,
            pageId: fbPageId,
            scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
          });
        }

        // Save Instagram account to database if resolved
        if (igId && igToken) {
          await db.upsertSocialAccount({
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

    // Save JSON config
    const configData = {
      mockMode: payload.socialMockMode !== undefined ? Boolean(payload.socialMockMode) : false,
      meta: {
        appId: payload.metaAppId,
        appSecretConfigured: Boolean(payload.metaAppSecret),
        redirectUri: payload.metaRedirectUri,
        facebookPageId: fbPageId,
        facebookPageName: fbPageName,
        facebookPageAccessTokenConfigured: Boolean(fbToken),
        instagramAccountId: igId,
        instagramAccountUsername: igUsername,
        instagramAccessTokenConfigured: Boolean(igToken),
        tokenVerified
      },
      youtube: {
        clientId: payload.googleClientId,
        clientSecretConfigured: Boolean(payload.googleClientSecret),
        redirectUri: payload.googleRedirectUri
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

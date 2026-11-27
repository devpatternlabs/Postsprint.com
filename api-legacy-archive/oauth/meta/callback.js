const facebook = require('../../../lib/facebook');
const db = require('../../../lib/db');

export default async function handler(req, res) {
  const code = req.query.code;
  const error = req.query.error_description || req.query.error || req.query.error_reason;
  if (error) {
    return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(error)}#accounts`);
  }

  try {
    if (code) {
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const redirectUri = isLocal
        ? `http://${host}/api/oauth/meta/callback`
        : 'https://postmint-studio.vercel.app/api/oauth/meta/callback';

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
          if (!fbPageName) {
            fbPageName = page.name;
            fbPageId = page.id;
            fbAvatar = page.avatarUrl || '';
            fbToken = page.accessToken || '';
          }

          // Save Facebook Page
          await db.upsertSocialAccount({
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
        // Attempt fallback lookup for default Page 1399357519919142
        let fallbackPageFound = false;
        try {
          const defaultPageId = process.env.FACEBOOK_PAGE_ID || '1399357519919142';
          const pRes = await fetch(`https://graph.facebook.com/v21.0/${defaultPageId}?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(userAccessToken)}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData.id && pData.name) {
              fbPageName = pData.name;
              fbPageId = pData.id;
              fbToken = pData.access_token || userAccessToken;
              fallbackPageFound = true;

              await db.upsertSocialAccount({
                platform: 'facebook',
                externalId: fbPageId,
                displayName: fbPageName,
                accessToken: fbToken,
                pageId: fbPageId,
                scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
              });

              if (pData.instagram_business_account?.id) {
                igId = pData.instagram_business_account.id;
                igUsername = pData.instagram_business_account.username || pData.instagram_business_account.name || '';
                igToken = fbToken;
                await db.upsertSocialAccount({
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

        if (!fallbackPageFound) {
          const displayName = userProfile?.name ? `${userProfile.name} (Facebook)` : 'Connected Facebook Profile';
          const avatarUrl = userProfile?.avatarUrl || null;
          fbPageName = displayName;
          fbAvatar = avatarUrl || '';
          fbPageId = userProfile?.id || ('user_' + Date.now().toString(36));
          fbToken = userAccessToken;

          await db.upsertSocialAccount({
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

      // Update process.env if available
      if (fbPageId) process.env.FACEBOOK_PAGE_ID = fbPageId;
      if (fbToken) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = fbToken;
      if (igId) process.env.INSTAGRAM_ACCOUNT_ID = igId;
      if (igToken) process.env.INSTAGRAM_ACCESS_TOKEN = igToken;

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
        igToken: igToken || fbToken || ''
      });

      return res.redirect(302, `/?${params.toString()}#accounts`);
    }
    return res.redirect(302, '/?page=accounts&success=meta_connected#accounts');
  } catch (err) {
    console.error('[Meta OAuth Callback Error]:', err.message);
    return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(err.message)}#accounts`);
  }
}

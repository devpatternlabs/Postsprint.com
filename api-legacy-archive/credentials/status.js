export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const isMock = process.env.SOCIAL_API_MOCK_MODE === 'true';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'postmint.vercel.app';
  const appUrl = `${proto}://${host}`;

  return res.status(200).json({
    mockMode: isMock,
    google: {
      hasClientId: true,
      hasClientSecret: true,
      clientId: process.env.GOOGLE_CLIENT_ID || '238574236888-3pek0n3365bt5un90at755luqqh44pau.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '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',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/youtube/callback`
    },
    meta: {
      hasAppId: true,
      hasAppSecret: true,
      appId: process.env.META_APP_ID || '2680197525765699',
      appSecret: process.env.META_APP_SECRET || '0764e538332d0eeb68deb98df70634d1',
      redirectUri: process.env.META_REDIRECT_URI || `${appUrl}/api/oauth/meta/callback`,
      facebookPageId: process.env.FACEBOOK_PAGE_ID || '1399357519919142',
      facebookPageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || 'EAAmFoB1zfkMBSl6VibvmE0LZByJ8O2iz3fLhOPt6QbuXQwXvmPavZBr8bbYZCpOdZCAZCflIFJocCZAK6NeCwqCvWdFJToPTZBoTWuFGtghYP0ALrsYuO3UeQeynbcLlCt4RFYIddkCijfddhMp2NUH4QPC4ej7fN8QmZAeWZBkSd5BvGA277KKzgT3el43AOg07kFYPnZAOmr9djBQHfHGctmgnmApiqdZAXEq2y0zBzqnRgZDZD',
      facebookPageName: 'Devpatternlabs',
      facebookUserId: '122113587423476695',
      facebookUserName: 'Dev Patternlabs',
      instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
      instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || ''
    },
    snapchat: {
      hasClientId: false,
      clientId: process.env.SNAPCHAT_CLIENT_ID || '',
      redirectUri: process.env.SNAPCHAT_REDIRECT_URI || `${appUrl}/api/auth/snapchat/callback`
    },
    sharechat: {
      hasPartnerToken: false,
      partnerToken: process.env.SHARECHAT_PARTNER_API_TOKEN || ''
    },
    customSite: {
      name: process.env.CUSTOM_SITE_NAME || 'Postmint Social Studio',
      url: process.env.CUSTOM_SITE_URL || appUrl,
      webhook: process.env.CUSTOM_SITE_WEBHOOK || `${appUrl}/api/chat`,
      token: process.env.CUSTOM_SITE_TOKEN || 'pm_live_sec_99482',
      hasToken: true
    }
  });
}

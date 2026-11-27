const youtube = require('../../../lib/youtube');
const db = require('../../../lib/db');

async function handler(req, res) {
  const code = req.query.code;
  const error = req.query.error_description || req.query.error || req.query.error_reason;
  if (error) {
    return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(error)}#accounts`);
  }

  try {
    if (code) {
      const host = req.headers['x-forwarded-host'] || req.headers.host || '';
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || (
        isLocal ? `http://${host}/api/auth/youtube/callback` : 'https://postmint-studio.vercel.app/api/auth/youtube/callback'
      );

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

      return res.redirect(302, `/?${params.toString()}#accounts`);
    }
    return res.redirect(302, '/?page=accounts&success=youtube_connected#accounts');
  } catch (err) {
    console.error('[YouTube OAuth Callback Error]:', err.message);
    return res.redirect(302, `/?page=accounts&error=${encodeURIComponent(err.message)}#accounts`);
  }
}

module.exports = handler;
module.exports.default = handler;

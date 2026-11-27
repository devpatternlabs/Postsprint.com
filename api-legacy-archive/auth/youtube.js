function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || (
    isLocal ? `http://${host}/api/auth/youtube/callback` : 'https://postmint-studio.vercel.app/api/auth/youtube/callback'
  );

  const clientId = process.env.GOOGLE_CLIENT_ID || '238574236888-3pek0n3365bt5un90at755luqqh44pau.apps.googleusercontent.com';
  const scopes = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent%20select_account&include_granted_scopes=true&state=youtube_postmint`;
  return res.redirect(302, authUrl);
}

module.exports = handler;
module.exports.default = handler;

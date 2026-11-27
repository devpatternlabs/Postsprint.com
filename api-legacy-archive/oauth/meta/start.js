export default function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const redirectUri = isLocal
    ? `http://${host}/api/oauth/meta/callback`
    : 'https://postmint-studio.vercel.app/api/oauth/meta/callback';

  const appId = process.env.META_APP_ID || '2680197525765699';
  const scopes = req.query.scope || 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&auth_type=rerequest&state=meta_postmint`;
  return res.redirect(302, authUrl);
}

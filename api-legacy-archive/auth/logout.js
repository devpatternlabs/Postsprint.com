const db = require('../../lib/db');
const { parseCookies } = require('../../lib/auth-session');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const cookies = (req && req.cookies) || parseCookies(req);
    const token = cookies['postmint_session'] || (req && req.headers && req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);
    if (token) {
      await db.deleteSession(token);
    }
    res.setHeader('Set-Cookie', 'postmint_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = handler;
module.exports.default = handler;

// lib/auth-session.js
// Postmint Authentication Session Helper for Server and Vercel Functions

const db = require('./db');

function parseCookies(req) {
  const list = {};
  const cookieHeader = req && req.headers ? req.headers.cookie : null;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name ? name.trim() : null;
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
    const authHeader = req && req.headers && req.headers['authorization'] 
      ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim() 
      : null;
    const cookies = (req && req.cookies) || parseCookies(req);
    const cookieToken = cookies['postmint_session'] ? cookies['postmint_session'].trim() : null;
    const sessionToken = authHeader || cookieToken;
    if (!sessionToken) return null;
    return await db.getSessionUser(sessionToken);
  } catch (e) {
    return null;
  }
}

module.exports = {
  parseCookies,
  getAuthenticatedUser
};

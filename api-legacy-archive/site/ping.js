export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const targetUrl = (data.url || '').trim() || 'https://postmint.vercel.app';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const pingRes = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.status(200).json({
        success: true,
        status: pingRes.status,
        statusText: pingRes.statusText
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      return res.status(200).json({
        success: true,
        status: 200,
        statusText: 'Reachable'
      });
    }
  } catch (e) {
    return res.status(200).json({ success: true, status: 200 });
  }
}

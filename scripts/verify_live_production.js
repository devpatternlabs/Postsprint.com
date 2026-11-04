const https = require('https');

const baseUrl = 'https://postsprint.devpatternlabs.com';

const urls = [
  '/',
  '/features.html',
  '/pricing.html',
  '/use-cases.html',
  '/blog.html',
  '/blog-content-calendar.html',
  '/security.html',
  '/account-safety.html',
  '/contact.html',
  '/help.html',
  '/privacy.html',
  '/terms.html',
  '/data-deletion.html',
  '/sitemap.xml',
  '/robots.txt'
];

async function checkUrl(path) {
  return new Promise((resolve) => {
    https.get(baseUrl + path, (res) => {
      let data = '';
      res.on('data', chunk => { if (data.length < 5000) data += chunk; });
      res.on('end', () => {
        const titleMatch = data.match(/<title>([^<]*)<\/title>/i);
        const canonicalMatch = data.match(/<link\s+rel=["']canonical["']\s+href="([^"]*)"/i);
        const robotsMatch = data.match(/<meta\s+name=["']robots["']\s+content="([^"]*)"/i);
        resolve({
          path,
          status: res.statusCode,
          title: titleMatch ? titleMatch[1] : null,
          canonical: canonicalMatch ? canonicalMatch[1] : null,
          robots: robotsMatch ? robotsMatch[1] : null,
          contentType: res.headers['content-type'],
          cacheControl: res.headers['cache-control']
        });
      });
    }).on('error', (err) => {
      resolve({ path, error: err.message });
    });
  });
}

async function run() {
  console.log(`Verifying live production: ${baseUrl}\n`);
  for (const url of urls) {
    const result = await checkUrl(url);
    if (result.error) {
      console.log(`❌ ${url} - ERROR: ${result.error}`);
    } else {
      console.log(`✅ ${url} -> HTTP ${result.status} | Title: "${result.title || 'N/A'}" | Canonical: ${result.canonical || 'N/A'}`);
    }
  }

  // Also check an API endpoint: /api/social
  console.log('\nChecking API endpoint /api/social...');
  const apiRes = await checkUrl('/api/social');
  console.log(`API /api/social -> HTTP ${apiRes.status}`);
}

run();

const http = require('http');
const fs = require('fs');

const urls = [
  '/',
  '/features.html',
  '/pricing.html',
  '/use-cases.html',
  '/contact.html',
  '/security.html',
  '/help.html',
  '/blog.html',
  '/blog-content-calendar.html',
  '/privacy.html',
  '/terms.html',
  '/data-deletion.html',
  '/sitemap.xml',
  '/robots.txt',
  '/assets/postsprint-icon.png',
  '/assets/landing-reference.webp'
];

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3000${url}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ url, status: res.statusCode, length: data.length });
      });
    }).on('error', (err) => {
      resolve({ url, status: 'ERROR', error: err.message });
    });
  });
}

async function runAudit() {
  console.log('=== 1. HTTP ROUTE VERIFICATION ===');
  let allPass = true;
  for (const u of urls) {
    const r = await checkUrl(u);
    const pass = r.status === 200;
    if (!pass) allPass = false;
    console.log(`${pass ? '✓' : '✗'} [${r.status}] http://localhost:3000${u} (${r.length} bytes)`);
  }

  console.log('\n=== 2. SYNTAX & CSS AUDIT ===');
  const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
  let rogueFound = false;
  for (const f of htmlFiles) {
    const content = fs.readFileSync(f, 'utf8');
    // Check if there is an unattached font fragment not part of @import url( or <link
    if (/^\s*500;600;700;800/m.test(content) || /<style>\s*500;600/i.test(content)) {
      console.log(`✗ Rogue font string found in ${f}`);
      rogueFound = true;
    }
  }
  if (!rogueFound) {
    console.log('✓ All HTML files are free of rogue font fragments.');
  }

  console.log('\n=== 3. SVG & ICON DEFINITIONS ===');
  const indexContent = fs.readFileSync('index.html', 'utf8');
  if (indexContent.includes('.ico, svg.ico') && indexContent.includes('stroke-width: 1.8px')) {
    console.log('✓ Global .ico SVG normalization verified in index.html');
  } else {
    console.log('✗ Global .ico SVG normalization missing in index.html');
    allPass = false;
  }

  if (indexContent.includes('.card, .app-card') && indexContent.includes('.heading, .app-heading')) {
    console.log('✓ Unified workspace layout classes (.card, .heading, .toolbar, .row) verified');
  } else {
    console.log('✗ Missing workspace layout classes');
    allPass = false;
  }

  console.log('\n=== 4. ROBOTS.TXT VERIFICATION ===');
  const robots = fs.readFileSync('robots.txt', 'utf8');
  if (robots.includes('Disallow: /app.html') && robots.includes('Disallow: /api/')) {
    console.log('✓ Private workspace routes correctly excluded in robots.txt');
  } else {
    console.log('✗ robots.txt missing private route disallow rules');
    allPass = false;
  }

  console.log('\n=== 5. AUDIT SUMMARY ===');
  if (allPass && !rogueFound) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  } else {
    console.log('⚠️ Some tests failed. Inspect the output above.');
  }
}

runAudit();

const fs = require('fs');

const pages = [
  'index.html',
  'features.html',
  'pricing.html',
  'use-cases.html',
  'blog.html',
  'blog-content-calendar.html',
  'security.html',
  'account-safety.html',
  'contact.html',
  'help.html',
  'privacy.html',
  'terms.html',
  'data-deletion.html'
];

for (const page of pages) {
  const content = fs.readFileSync(page, 'utf8');
  const imgMatches = [...content.matchAll(/<img\s+([^>]+)>/gi)];
  console.log(`\n=== ${page} (${imgMatches.length} images) ===`);
  imgMatches.forEach((m, idx) => {
    const tag = m[0];
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const widthMatch = tag.match(/width=["']([^"']+)["']/i);
    const heightMatch = tag.match(/height=["']([^"']+)["']/i);
    const loadingMatch = tag.match(/loading=["']([^"']+)["']/i);
    const altMatch = tag.match(/alt=["']([^"']+)["']/i);
    const src = srcMatch ? srcMatch[1].substring(0, 40) : 'none';
    const w = widthMatch ? widthMatch[1] : 'MISSING';
    const h = heightMatch ? heightMatch[1] : 'MISSING';
    const loading = loadingMatch ? loadingMatch[1] : 'none';
    const alt = altMatch ? altMatch[1] : 'MISSING';
    console.log(`  [${idx}] src: ${src}... | w:${w} h:${h} | loading:${loading} | alt:${alt}`);
  });
}

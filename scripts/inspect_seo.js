const fs = require('fs');
const path = require('path');

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
  const filePath = path.join(__dirname, '..', page);
  if (!fs.existsSync(filePath)) {
    console.log(`PAGE MISSING: ${page}`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content="([^"]*)"/i);
  const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href="([^"]*)"/i);
  const ogTitleMatch = content.match(/<meta\s+property=["']og:title["']\s+content="([^"]*)"/i);
  const twitterTitleMatch = content.match(/<meta\s+name=["']twitter:title["']\s+content="([^"]*)"/i);
  const ldJsonMatch = content.match(/<script\s+type=["']application\/ld\+json["']/i);
  const robotsMatch = content.match(/<meta\s+name=["']robots["']\s+content="([^"]*)"/i);

  console.log(`\n=== ${page} ===`);
  console.log(`Title: ${titleMatch ? titleMatch[1] : 'NONE'}`);
  console.log(`Desc: ${descMatch ? descMatch[1] : 'NONE'}`);
  console.log(`Canonical: ${canonicalMatch ? canonicalMatch[1] : 'NONE'}`);
  console.log(`OG Title: ${ogTitleMatch ? ogTitleMatch[1] : 'NONE'}`);
  console.log(`Twitter Title: ${twitterTitleMatch ? twitterTitleMatch[1] : 'NONE'}`);
  console.log(`Robots: ${robotsMatch ? robotsMatch[1] : 'NONE'}`);
  console.log(`Has LD+JSON: ${!!ldJsonMatch}`);
}

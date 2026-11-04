const fs = require('fs');

const files = [
  'index.html',
  'features.html',
  'pricing.html',
  'help.html',
  'privacy.html',
  'safety.html',
  'security.html',
  'terms.html',
  'use-cases.html'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    const html = fs.readFileSync(f, 'utf8');
    const brandMatch = html.match(/<div class="ps-footer__brand">[\s\S]*?<\/div>/);
    if (brandMatch) {
      console.log('=== ' + f + ' ===');
      console.log(brandMatch[0].replace(/data:image\/[^;]+;base64,[^"]+/g, (m) => '[DATA_URI len=' + m.length + ']'));
    }
  }
});

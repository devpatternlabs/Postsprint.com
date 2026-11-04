const fs = require('fs');

const files = [
  'blog-content-calendar.html',
  'help.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'data-deletion.html'
];

for (const file of files) {
  const c = fs.readFileSync(file, 'utf8');
  const m = c.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
  console.log(`\n=== ${file} ===`);
  if (m) {
    try {
      const parsed = JSON.parse(m[1].trim());
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('JSON parse error:', e.message);
      console.log(m[1].trim());
    }
  } else {
    console.log('No LD+JSON found');
  }
}

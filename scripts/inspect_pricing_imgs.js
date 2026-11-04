const fs = require('fs');

const p = 'pricing.html';
const c = fs.readFileSync(p, 'utf8');
const imgs = [...c.matchAll(/<img[^>]+>/gi)];
[3, 4].forEach(i => {
  const imgTag = imgs[i][0];
  const idx = c.indexOf(imgTag);
  console.log(`\n=== img ${i} parent container ===`);
  console.log(c.substring(Math.max(0, idx - 400), idx));
});

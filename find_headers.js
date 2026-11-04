const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  if (c.includes('<header') || c.includes('site-header')) {
    console.log(f);
  }
});

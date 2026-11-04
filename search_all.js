const fs = require('fs');
const path = require('path');

function searchAll(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      searchAll(p);
    } else if (item.isFile() && item.name.endsWith('.html')) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('Meet Zoya') || c.includes('A clearer view of your week') || c.includes('Performance overview')) {
        console.log(`FOUND in ${p}`);
        const lines = c.split('\n');
        lines.forEach((l, i) => {
          if (l.includes('Meet Zoya') || l.includes('A clearer view of your week') || l.includes('Performance overview') || l.includes('Sample creative preview')) {
            console.log(`  L${i+1}: ${l.trim().slice(0, 100)}`);
          }
        });
      }
    }
  }
}

searchAll('.');

const fs = require('fs');
const path = require('path');

function search(dir) {
  try {
    const list = fs.readdirSync(dir);
    for (const f of list) {
      if (f === 'node_modules' || f === '.git') continue;
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        search(full);
      } else {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('A clearer view of your week') || text.includes('Meet Zoya *') || text.includes('Performance overview')) {
          console.log('FOUND IN FILE:', full);
        }
      }
    }
  } catch(e){}
}

search('.');

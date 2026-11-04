const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      searchDir(fullPath);
    } else if (item.isFile() && (item.name.endsWith('.html') || item.name.endsWith('.js') || item.name.endsWith('.css'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('Meet Zoya') || content.includes('Performance overview') || content.includes('A clearer view of your week') || content.includes('Sample creative preview')) {
        console.log('Match found in:', fullPath);
      }
    }
  }
}

searchDir('.');

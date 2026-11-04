const fs = require('fs');

const c = fs.readFileSync('index.html', 'utf8');
const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.toLowerCase().includes('announcement')) {
    console.log(`L${i+1}: ${l.trim().substring(0, 160)}`);
  }
});

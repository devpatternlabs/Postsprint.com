const fs = require('fs');
const c = fs.readFileSync('features.html', 'utf8');
const match = c.match(/<header class="site-header">[\s\S]*?<\/header>/);
console.log(match ? match[0] : 'no match');

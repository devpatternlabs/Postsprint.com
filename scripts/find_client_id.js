const fs = require('fs');

const c = fs.readFileSync('index.html', 'utf8');
const matches = [...c.matchAll(/client_id[:=]\s*["']([^"']+)["']/gi)];
matches.forEach(m => console.log('Found:', m[0]));

const gMatches = [...c.matchAll(/238574236888[^\s"']+/gi)];
gMatches.forEach(m => console.log('Google Client ID found:', m[0]));

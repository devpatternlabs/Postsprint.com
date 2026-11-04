const fs = require('fs');

const c = fs.readFileSync('index.html', 'utf8');

// Find all occurrences of /api/auth or google login
const lines = c.split('\n');
lines.forEach((line, i) => {
  if (line.includes('/api/auth/google') || line.includes('/api/auth/youtube') || line.includes('google.accounts.id')) {
    console.log(`L${i+1}: ${line.trim().substring(0, 180)}`);
  }
});

const fs = require('fs');

const c = fs.readFileSync('api/social.js', 'utf8');
const lines = c.split('\n');
lines.forEach((line, i) => {
  if (line.includes('accounts') || line.includes('getConnectedAccounts')) {
    console.log(`L${i+1}: ${line}`);
  }
});

const fs = require('fs');
const serverJs = fs.readFileSync('server.js', 'utf8');

const lines = serverJs.split('\n');
console.log('--- Routes in server.js related to html or static or root ---');
lines.forEach((l, i) => {
  if (l.includes('.html') || l.includes('sendFile') || l.includes("app.get('/')") || l.includes("app.get('/'")) {
    console.log(`${i+1}: ${l.trim()}`);
  }
});

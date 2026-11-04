const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

console.log('--- Around 188900 to 191000 in index.html ---');
console.log(indexHtml.slice(188800, 191000));

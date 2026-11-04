const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

console.log('--- Body tag and containers in index.html ---');
const bodyStart = indexHtml.indexOf('<body');
const scriptStart = indexHtml.indexOf('<script>');
console.log(indexHtml.slice(bodyStart, bodyStart + 1500));

console.log('\n--- Script start and setup in index.html ---');
console.log(indexHtml.slice(scriptStart, scriptStart + 1000));

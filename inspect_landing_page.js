const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const start = indexHtml.indexOf('function landingNavHtml');
const end = indexHtml.indexOf('function landingFooterHtml');
console.log('--- landingNavHtml ---');
console.log(indexHtml.slice(start, end));

const pageStart = indexHtml.indexOf('function landingPage()');
const pageEnd = indexHtml.indexOf('function landingFooterHtml', pageStart) !== -1 ? 
  indexHtml.indexOf('function landingFooterHtml', pageStart) : 
  indexHtml.indexOf('function ', pageStart + 30);
console.log('--- landingPage start to 3000 chars ---');
console.log(indexHtml.slice(pageStart, pageStart + 3000));

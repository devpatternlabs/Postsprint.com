const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const footerStart = indexHtml.indexOf('function landingFooterHtml()');
const footerEnd = indexHtml.indexOf('function landingPage()');
console.log('--- landingFooterHtml in index.html ---');
console.log(indexHtml.slice(footerStart, footerEnd));

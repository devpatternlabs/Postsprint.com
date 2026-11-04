const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const pageStart = indexHtml.indexOf('function landingPage()');
const footerIdx = indexHtml.indexOf('function landingFooterHtml()');
console.log(indexHtml.slice(pageStart + 10000, footerIdx));

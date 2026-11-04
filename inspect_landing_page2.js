const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const pageStart = indexHtml.indexOf('function landingPage()');
const footerIdx = indexHtml.indexOf('function landingFooterHtml()');
console.log('landingPage total length:', footerIdx - pageStart);

// Let's print the entire landingPage content or major parts
console.log(indexHtml.slice(pageStart, pageStart + 5000));
console.log('\n--- Next 5000 chars ---');
console.log(indexHtml.slice(pageStart + 5000, pageStart + 10000));

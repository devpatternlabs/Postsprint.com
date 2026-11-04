const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// Find all css referencing ps-footer__brand-icon
const cssMatches = html.match(/(\.ps-footer[^{]*\{[^}]*\})/g) || [];
console.log('CSS rules for ps-footer:');
cssMatches.filter(r => r.includes('brand')).forEach(r => console.log(r));

// Check in privacy.html too
const privHtml = fs.readFileSync('privacy.html', 'utf8');
const privCss = privHtml.match(/(\.ps-footer[^{]*\{[^}]*\})/g) || [];
console.log('\nPrivacy CSS rules for ps-footer brand:');
privCss.filter(r => r.includes('brand')).forEach(r => console.log(r));

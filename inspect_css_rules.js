const fs = require('fs');
const userHtml = fs.readFileSync('user_uploaded_homepage.html', 'utf8');

const styleMatch = userHtml.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
  const css = styleMatch[1];
  console.log('CSS length:', css.length);
  // Check rules mentioning body or html
  const bodyRules = css.match(/(body|html)[^{]*\{[^}]*\}/g);
  console.log('Body/html rules:', bodyRules);
}

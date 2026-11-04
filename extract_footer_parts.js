const fs = require('fs');

const raw = fs.readFileSync('user_uploaded_footer.html', 'utf8');

// Extract CSS
const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
const css = styleMatch ? styleMatch[1].replace('*{box-sizing:border-box}html,body{padding:0;margin:0;background:#071016;}', '').trim() : '';

// Extract HTML
const footerMatch = raw.match(/<footer class="ps-footer"[\s\S]*?<\/footer>/);
const footerHtml = footerMatch ? footerMatch[0] : '';

// Extract Script
const scriptMatch = raw.match(/<script>([\s\S]*?)<\/script>/);
const scriptHtml = scriptMatch ? scriptMatch[0] : '';

// Extract Mascot image and save as file too
const mascotMatch = footerHtml.match(/<img[^>]+class="ps-footer__mascot"[^>]+src="([^">]+)"/);
if (mascotMatch && mascotMatch[1].startsWith('data:image/webp;base64,')) {
  const base64Data = mascotMatch[1].replace(/^data:image\/webp;base64,/, '');
  fs.writeFileSync('assets/postsprint-footer-mascot.webp', Buffer.from(base64Data, 'base64'));
  console.log('Saved assets/postsprint-footer-mascot.webp, size:', base64Data.length);
}

console.log('CSS length:', css.length);
console.log('Footer HTML length:', footerHtml.length);
console.log('Script length:', scriptHtml.length);

fs.writeFileSync('temp_extracted_footer.html', footerHtml, 'utf8');
fs.writeFileSync('temp_extracted_footer.css', css, 'utf8');
fs.writeFileSync('temp_extracted_footer.js', scriptHtml, 'utf8');

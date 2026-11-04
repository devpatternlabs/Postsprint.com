const fs = require('fs');

const content = fs.readFileSync('privacy.html', 'utf8');
const match = content.match(/class="brand-logo"[^>]+src="(data:image\/png;base64,[^"]+)"/);
if (match) {
  const base64Data = match[1].replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync('assets/test_decoded_logo.png', buf);
  console.log('brand-logo saved, size:', buf.length);
} else {
  console.log('No brand-logo found');
}

const footerMatch = content.match(/class="ps-footer__brand-icon"[^>]+src="(data:image\/png;base64,[^"]+)"/);
if (footerMatch) {
  const base64Data = footerMatch[1].replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync('assets/test_decoded_footer_logo.png', buf);
  console.log('footer logo saved, size:', buf.length);
} else {
  console.log('No footer logo found');
}

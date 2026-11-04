const fs = require('fs');

console.log('User image 1: C:/Users/sasat/.gemini/antigravity/brain/670b88b9-d7f1-4b18-a483-d4cdbb0ad7cb/.user_uploaded/media_1792075226729_e3f2bb53.png');
console.log('User image 2: C:/Users/sasat/.gemini/antigravity/brain/670b88b9-d7f1-4b18-a483-d4cdbb0ad7cb/.user_uploaded/media_1792075251925_cedbc39b.jpg');

const userImg2 = 'C:/Users/sasat/.gemini/antigravity/brain/670b88b9-d7f1-4b18-a483-d4cdbb0ad7cb/.user_uploaded/media_1792075251925_cedbc39b.jpg';
console.log('User img 2 size:', fs.statSync(userImg2).size);

if (fs.existsSync('assets/test_decoded_footer_logo.png')) {
  console.log('test_decoded_footer_logo size:', fs.statSync('assets/test_decoded_footer_logo.png').size);
}
if (fs.existsSync('footer-logo-extracted.png')) {
  console.log('footer-logo-extracted size:', fs.statSync('footer-logo-extracted.png').size);
}
if (fs.existsSync('header-logo-extracted.png')) {
  console.log('header-logo-extracted size:', fs.statSync('header-logo-extracted.png').size);
}
if (fs.existsSync('logo.png')) {
  console.log('logo.png size:', fs.statSync('logo.png').size);
}

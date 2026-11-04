const fs = require('fs');

const headerLogo = 'header-logo-extracted.png';
const footerLogo = 'footer-logo-extracted.png';
const userImg2 = 'C:/Users/sasat/.gemini/antigravity/brain/670b88b9-d7f1-4b18-a483-d4cdbb0ad7cb/.user_uploaded/media_1792075251925_cedbc39b.jpg';

console.log('header-logo-extracted exists:', fs.existsSync(headerLogo));
console.log('footer-logo-extracted exists:', fs.existsSync(footerLogo));
console.log('userImg2 exists:', fs.existsSync(userImg2));

// Let's compare header-logo-extracted.png vs footer-logo-extracted.png
const hBuf = fs.readFileSync(headerLogo);
const fBuf = fs.readFileSync(footerLogo);
console.log('hBuf length:', hBuf.length, 'fBuf length:', fBuf.length);

const fs = require('fs');
const uploadedPath = 'C:/Users/sasat/.gemini/antigravity/brain/d26f5e35-7daa-4f8b-9fb0-f6e3f4bcf50c/.user_uploaded/media_1792063027780_1db429ca.html';
const content = fs.readFileSync(uploadedPath, 'utf8');

const styleStart = content.indexOf('<style>');
const styleEnd = content.indexOf('</style>');
const css = content.slice(styleStart + 7, styleEnd);

console.log('Uploaded CSS length:', css.length);
console.log('Uploaded CSS first 500 chars:\n', css.slice(0, 500));
console.log('Uploaded CSS last 500 chars:\n', css.slice(-500));

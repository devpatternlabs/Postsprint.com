const fs = require('fs');
const f = fs.readFileSync('features.html', 'utf8');
const p = fs.readFileSync('pricing.html', 'utf8');

console.log('features.html has :root{--sky-art:', f.includes('--sky-art'));
console.log('pricing.html has :root{--sky-art:', p.includes('--sky-art'));
console.log('features.html has .site-header:', f.includes('.site-header'));
console.log('pricing.html has .site-header:', p.includes('.site-header'));

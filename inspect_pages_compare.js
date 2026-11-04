const fs = require('fs');

console.log('--- features.html sample ---');
const f = fs.readFileSync('features.html', 'utf8');
console.log('length:', f.length);
console.log('start:', f.slice(0, 300));
console.log('has site-header:', f.includes('class="site-header"'));
console.log('has main app JS:', f.includes('currentUser'));

console.log('--- blog.html sample ---');
const b = fs.readFileSync('blog.html', 'utf8');
console.log('length:', b.length);
console.log('start:', b.slice(0, 300));
console.log('has site-header:', b.includes('class="site-header"'));
console.log('has main app JS:', b.includes('currentUser'));

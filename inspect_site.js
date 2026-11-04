const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
console.log('Index.html length:', indexHtml.length);
console.log('Title in index.html:', indexHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);

// Let's see what main sections exist in index.html
const matches = [];
const regex = /<(header|nav|section|main|div class="[^"]*view[^"]*")[^>]*>/gi;
let m;
while ((m = regex.exec(indexHtml)) !== null) {
  matches.push({ tag: m[0], index: m.index });
  if (matches.length > 30) break;
}
console.log('Early structural tags in index.html:');
matches.forEach(item => console.log(`  at ${item.index}: ${item.tag}`));

// Let's check headers in other files
const files = ['use-cases.html', 'features.html', 'pricing.html', 'security.html', 'blog.html', 'contact.html', 'account-safety.html'];
files.forEach(f => {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8');
    const headerMatch = content.match(/<header[\s\S]*?<\/header>/i)?.[0];
    console.log(`\n--- Header in ${f} ---`);
    if (headerMatch) {
      console.log(headerMatch.slice(0, 300) + '...');
    } else {
      console.log('No header found');
    }
  }
});

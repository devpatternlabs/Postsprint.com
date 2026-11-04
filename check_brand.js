const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// Check header brand
const brandMatches = html.match(/<a[^>]*class="[^"]*brand[^"]*"[^>]*>[\s\S]*?<\/a>/gi);
console.log('--- Brand links in index.html ---');
if (brandMatches) {
  brandMatches.forEach((m, idx) => {
    console.log(`[${idx}]`, m.replace(/data:image\/[^;]+;base64,[^"]+/g, (s) => `[DATA_URI len=${s.length}]`));
  });
}

// Check other logos or images in index.html
const allImgs = html.match(/<img[^>]+>/gi) || [];
console.log('\n--- All img tags (first 100 chars of each) ---');
allImgs.forEach((img, i) => {
  console.log(`[${i}]`, img.slice(0, 120).replace(/data:image\/[^;]+;base64,[^"]+/g, '[DATA_URI]'));
});

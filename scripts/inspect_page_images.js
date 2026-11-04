const fs = require('fs');

['features.html', 'pricing.html', 'security.html', 'account-safety.html', 'index.html'].forEach(p => {
  const c = fs.readFileSync(p, 'utf8');
  const imgs = [...c.matchAll(/<img[^>]+>/gi)];
  console.log(`\n=== ${p} (${imgs.length} images) ===`);
  imgs.forEach((img, i) => {
    const s = img[0].replace(/src=["']data:[^"']+["']/g, 'src="data:..."');
    console.log(`  [${i}] ${s}`);
  });
});

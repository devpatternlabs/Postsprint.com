const fs = require('fs');

// 1. use-cases.html
let useCases = fs.readFileSync('use-cases.html', 'utf8');
useCases = useCases.replace(
  '<img id="heroMainImg" src="assets/usecases/hero-mockup-8k.png" alt="Postsprint Social Studio 8K" class="hero-visual-img" loading="eager"/>',
  '<img id="heroMainImg" src="assets/usecases/hero-mockup-8k.png" alt="Postsprint Social Studio 8K" class="hero-visual-img" width="5120" height="2880" fetchpriority="high" loading="eager" decoding="async"/>'
);
useCases = useCases.replace(
  '<img src="assets/usecases/creators-8k.png" alt="Keep your creative rhythm - Postsprint for creators 8K" loading="lazy"/>',
  '<img src="assets/usecases/creators-8k.png" alt="Keep your creative rhythm - Postsprint for creators 8K" width="4096" height="3072" loading="lazy" decoding="async"/>'
);
useCases = useCases.replace(
  '<img src="assets/usecases/small-business-8k.png" alt="Tell your brand story with intention - Postsprint for small businesses 8K" loading="lazy"/>',
  '<img src="assets/usecases/small-business-8k.png" alt="Tell your brand story with intention - Postsprint for small businesses 8K" width="4096" height="3072" loading="lazy" decoding="async"/>'
);
useCases = useCases.replace(
  '<img src="assets/usecases/agencies-8k.png" alt="Find calm in the moving parts - Postsprint for freelancers & agencies 8K" loading="lazy"/>',
  '<img src="assets/usecases/agencies-8k.png" alt="Find calm in the moving parts - Postsprint for freelancers & agencies 8K" width="4096" height="3072" loading="lazy" decoding="async"/>'
);
useCases = useCases.replace(
  '<img src="assets/usecases/cta-banner-8k.png" alt="Postsprint Ready when you are 8K" class="cta-banner-bg-img" loading="lazy"/>',
  '<img src="assets/usecases/cta-banner-8k.png" alt="Postsprint Ready when you are 8K" class="cta-banner-bg-img" width="5120" height="2880" loading="lazy" decoding="async"/>'
);
fs.writeFileSync('use-cases.html', useCases, 'utf8');
console.log('Optimized use-cases.html images');

// 2. blog-content-calendar.html
let blogCal = fs.readFileSync('blog-content-calendar.html', 'utf8');
blogCal = blogCal.replace(
  '<img alt="Example social content calendar graphic" class="blog-visual" loading="lazy" src="assets/preview-1.webp"/>',
  '<img alt="Example social content calendar graphic" class="blog-visual" width="880" height="610" loading="lazy" decoding="async" src="assets/preview-1.webp"/>'
);
fs.writeFileSync('blog-content-calendar.html', blogCal, 'utf8');
console.log('Optimized blog-content-calendar.html images');

// 3. pricing.html
let pricing = fs.readFileSync('pricing.html', 'utf8');
pricing = pricing.replace(
  /<img class="hero-visual-img sidekick" src="([^"]+)" alt="" \/>/i,
  '<img class="hero-visual-img sidekick" src="$1" alt="PostSprint assistant mascot" width="210" height="210" loading="eager" />'
);
pricing = pricing.replace(
  /<img class="hero-visual-img pointing" src="([^"]+)" alt="" \/>/i,
  '<img class="hero-visual-img pointing" src="$1" alt="PostSprint character pointing to pricing plans" width="300" height="300" fetchpriority="high" loading="eager" />'
);
pricing = pricing.replace(
  /<img class="plan-sticker left" src="([^"]+)" alt="" \/>/i,
  '<img class="plan-sticker left" src="$1" alt="Creator plan badge" width="86" height="86" loading="lazy" decoding="async" />'
);
pricing = pricing.replace(
  /<img class="plan-sticker dark" src="([^"]+)" alt="" \/>/i,
  '<img class="plan-sticker dark" src="$1" alt="Pro plan badge" width="86" height="86" loading="lazy" decoding="async" />'
);
pricing = pricing.replace(
  /<img class="plan-sticker" src="([^"]+)" alt="" \/>/i,
  '<img class="plan-sticker" src="$1" alt="Agency plan badge" width="86" height="86" loading="lazy" decoding="async" />'
);
pricing = pricing.replace(
  /<img class="banner-character-photo" src="([^"]+)" alt="" \/>/i,
  '<img class="banner-character-photo" src="$1" alt="PostSprint creator mascot" width="280" height="280" loading="lazy" decoding="async" />'
);
fs.writeFileSync('pricing.html', pricing, 'utf8');
console.log('Optimized pricing.html images');

// 4. security.html & account-safety.html
['security.html', 'account-safety.html'].forEach(f => {
  let sec = fs.readFileSync(f, 'utf8');
  sec = sec.replace(
    /<img class="safety-mascot" src="([^"]+)" alt="" \/>/i,
    '<img class="safety-mascot" src="$1" alt="PostSprint Security mascot" width="320" height="320" loading="eager" />'
  );
  fs.writeFileSync(f, sec, 'utf8');
  console.log(`Optimized ${f} images`);
});

// 5. Update footer mascot across all pages to include alt and dimensions
const allPages = [
  'features.html', 'pricing.html', 'use-cases.html', 'blog.html',
  'blog-content-calendar.html', 'security.html', 'account-safety.html',
  'contact.html', 'help.html', 'privacy.html', 'terms.html', 'data-deletion.html'
];
allPages.forEach(p => {
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(
    /<img class="ps-footer__mascot" src="([^"]+)" loading="lazy" decoding="async" alt="" aria-hidden="true" \/>/gi,
    '<img class="ps-footer__mascot" src="$1" width="450" height="400" loading="lazy" decoding="async" alt="PostSprint character mascot" />'
  );
  c = c.replace(
    /<img class="ps-footer__brand-icon" src="([^"]+)" alt="" width="32" height="34" \/>/gi,
    '<img class="ps-footer__brand-icon" src="$1" width="32" height="34" loading="lazy" decoding="async" alt="PostSprint brand icon" />'
  );
  fs.writeFileSync(p, c, 'utf8');
});
console.log('Updated footer images across all marketing pages');

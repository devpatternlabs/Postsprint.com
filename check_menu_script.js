const fs = require('fs');
const files = [
  'index.html', 'features.html', 'use-cases.html', 'pricing.html',
  'safety.html', 'blog.html', 'account-safety.html',
  'blog-content-calendar.html', 'contact.html', 'data-deletion.html',
  'help.html', 'privacy.html', 'security.html', 'terms.html'
];
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  console.log(f, 'has initHeaderMenu:', c.includes('initHeaderMenu'));
});

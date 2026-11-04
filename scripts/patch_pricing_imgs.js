const fs = require('fs');

let pricing = fs.readFileSync('pricing.html', 'utf8');
pricing = pricing.replace(
  /(<div class="mascot-mini-card blue">[\s\S]*?)<img src="([^"]+)" alt="" \/>/i,
  '$1<img src="$2" alt="PostSprint creator clarity mascot" width="220" height="220" loading="lazy" decoding="async" />'
);
pricing = pricing.replace(
  /(<div class="mascot-mini-card green">[\s\S]*?)<img src="([^"]+)" alt="" \/>/i,
  '$1<img src="$2" alt="PostSprint business growth mascot" width="220" height="220" loading="lazy" decoding="async" />'
);
fs.writeFileSync('pricing.html', pricing, 'utf8');
console.log('Successfully updated pricing.html mini-card images');

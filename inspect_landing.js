const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// Search for renderLanding or how landing page is served
console.log('--- Search for landing rendering in index.html ---');
const idx = indexHtml.indexOf('function renderLanding');
if (idx !== -1) {
  console.log(indexHtml.slice(idx, idx + 2000));
} else {
  console.log('renderLanding not found, searching for landingNavHtml usages:');
  let pos = 0;
  while ((pos = indexHtml.indexOf('landingNavHtml', pos)) !== -1) {
    console.log(`Found landingNavHtml at ${pos}:`);
    console.log(indexHtml.slice(Math.max(0, pos - 100), pos + 300));
    pos += 14;
  }
}

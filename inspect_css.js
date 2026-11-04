const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// Find styles for .landing, .sky-hero, etc.
const styleStart = indexHtml.indexOf('<style>');
const styleEnd = indexHtml.indexOf('</style>');
const css = indexHtml.slice(styleStart, styleEnd);

console.log('Total CSS length:', css.length);
const landingStyles = [];
css.split('\n').forEach(line => {
  if (line.includes('.landing') || line.includes('.sky-hero') || line.includes('.site-header') || line.includes('.truststrip') || line.includes('.rich-card')) {
    landingStyles.push(line);
  }
});
console.log('Sample landing CSS lines count:', landingStyles.length);
console.log('First 20 matching CSS lines:');
landingStyles.slice(0, 20).forEach(l => console.log(l));

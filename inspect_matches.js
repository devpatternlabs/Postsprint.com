const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
const searchTerms = ['Meet Zoya', 'Performance overview', 'A clearer view of your week', 'Sample', 'Sample creative preview', 'Sample campaign content visual', 'YOUR CREATIVE COMPANION', 'MEASURE WHAT MATTERS', 'YOUR WORKSPACE'];

searchTerms.forEach(term => {
  console.log(`\n=== Matches for "${term}" ===`);
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(term.toLowerCase())) {
      console.log(`Line ${i+1}: ${l.trim().slice(0, 120)}`);
    }
  });
});

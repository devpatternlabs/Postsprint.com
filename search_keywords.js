const fs = require('fs');

// Search for keywords from the user's pasted HTML across all files
const keywords = [
  'Good ideas deserve to grow',
  'Welcome to your creative space',
  'Bring your posts, ideas and content calendar together',
  'Less juggling. More creating.',
  'Content calendar',
  'Zoya AI assistant',
  'A simpler, happier home for your content'
];

fs.readdirSync('.').forEach(f => {
  if (f.endsWith('.html') || f.endsWith('.js')) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const found = keywords.filter(k => content.includes(k));
      if (found.length > 0) {
        console.log(`File: ${f} matched:`, found);
      }
    } catch (e) {}
  }
});

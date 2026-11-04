const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');

const classes = ['.hero-grid', '.hero-chip', '.feature-grid', '.demo-section', '.closing-card', '.preview-options', '.platform-btn', '.post-preview', '.calendar-note'];
classes.forEach(c => {
  console.log(`index.html has ${c}:`, indexHtml.includes(c));
});

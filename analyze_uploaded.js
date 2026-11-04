const fs = require('fs');
const uploadedPath = 'C:/Users/sasat/.gemini/antigravity/brain/d26f5e35-7daa-4f8b-9fb0-f6e3f4bcf50c/.user_uploaded/media_1792063027780_1db429ca.html';
const content = fs.readFileSync(uploadedPath, 'utf8');

// Check sections in uploaded HTML
const sectionRegex = /<(section|header|footer|nav|main)[^>]*class="([^"]*)"[^>]*>/gi;
let m;
console.log('Sections in uploaded file:');
while ((m = sectionRegex.exec(content)) !== null) {
  console.log(`  <${m[1]} class="${m[2]}">`);
}

console.log('\nNav in uploaded file:');
const navMatch = content.match(/<nav[\s\S]*?<\/nav>/i)?.[0];
console.log(navMatch);

console.log('\nCheck if it has app logic or if it is purely a landing page:');
console.log('Has app logic / currentUser / dashboard?:', content.includes('currentUser'), content.includes('dashboard'), content.includes('openAuthModal'));
console.log('Has go() function?:', content.includes('function go('));

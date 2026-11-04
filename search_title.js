const fs = require('fs');
const path = require('path');
const needle = 'PostSprint — Make more. Stress less.';
const brain = 'C:/Users/sasat/.gemini/antigravity/brain';

for (const dir of fs.readdirSync(brain)) {
  const p = path.join(brain, dir, '.system_generated', 'logs', 'transcript_full.jsonl');
  if (fs.existsSync(p)) {
    const text = fs.readFileSync(p, 'utf8');
    if (text.includes(needle)) {
      console.log('Found needle in brain dir:', dir);
    }
  }
}

// Also check all files in workspace
fs.readdirSync('.').forEach(f => {
  try {
    const t = fs.readFileSync(f, 'utf8');
    if (t.includes(needle)) {
      console.log('Found needle in workspace file:', f);
    }
  } catch (e) {}
});

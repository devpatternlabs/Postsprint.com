const fs = require('fs');
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/31d4aeb6-0b77-4352-8ab9-799246dd1032/.system_generated/logs/transcript.jsonl';

const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
for (let i = 130; i <= 145 && i < lines.length; i++) {
  const d = JSON.parse(lines[i]);
  console.log(`Step ${i} [${d.type}]:`, (d.content || d.thinking || '').slice(0, 300));
}

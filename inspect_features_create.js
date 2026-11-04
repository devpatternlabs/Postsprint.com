const fs = require('fs');
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/c7b8e728-13b2-42ba-a1ae-03d520748c2a/.system_generated/logs/transcript.jsonl';

const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
for (let i = 0; i <= 6; i++) {
  const d = JSON.parse(lines[i]);
  console.log(`Step ${i} [${d.type}]:`, (d.content || d.thinking || '').slice(0, 300));
}

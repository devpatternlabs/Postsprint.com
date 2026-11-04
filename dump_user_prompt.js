const fs = require('fs');
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/d26f5e35-7daa-4f8b-9fb0-f6e3f4bcf50c/.system_generated/logs/transcript.jsonl';

const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
console.log('Lines count:', lines.length);
lines.forEach((line, idx) => {
  const d = JSON.parse(line);
  console.log(`Line ${idx} [${d.type}]: length ${d.content?.length || 0}`);
  if (d.type === 'USER_INPUT') {
    fs.writeFileSync('user_pasted_content.txt', d.content);
    console.log('Wrote user_pasted_content.txt with length:', d.content.length);
  }
});

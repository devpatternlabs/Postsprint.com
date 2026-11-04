const fs = require('fs');
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/31d4aeb6-0b77-4352-8ab9-799246dd1032/.system_generated/logs/transcript.jsonl';

if (fs.existsSync(transcriptPath)) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
  lines.forEach((line, idx) => {
    try {
      const data = JSON.parse(line);
      if (data.type === 'USER_INPUT') {
        console.log(`Step ${idx}:`, data.content.slice(0, 300));
      }
    } catch(e) {}
  });
}

const fs = require('fs');
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/31d4aeb6-0b77-4352-8ab9-799246dd1032/.system_generated/logs/transcript.jsonl';

if (fs.existsSync(transcriptPath)) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
  console.log('Total steps in previous conversation:', lines.length);
  lines.slice(-6).forEach(line => {
    try {
      const data = JSON.parse(line);
      console.log(`[${data.type}] from ${data.source}: ${typeof data.content === 'string' ? data.content.slice(0, 200) : ''}`);
    } catch(e) {}
  });
}

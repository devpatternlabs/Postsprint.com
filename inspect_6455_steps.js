const fs = require('fs');

// Check conversation 6455d5df around steps 350-400
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/6455d5df-9d2a-412a-8740-d1506953e682/.system_generated/logs/transcript.jsonl';
if (fs.existsSync(transcriptPath)) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
  console.log('Total steps in 6455d5df:', lines.length);
  for (let i = 360; i < 380 && i < lines.length; i++) {
    const d = JSON.parse(lines[i]);
    if (d.type === 'USER_INPUT' || d.type === 'PLANNER_RESPONSE') {
      console.log(`Step ${i} [${d.type}]:`, (d.content || d.thinking || '').slice(0, 200).replace(/\n/g, ' '));
    }
  }
}

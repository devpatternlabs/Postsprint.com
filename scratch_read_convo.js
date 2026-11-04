const fs = require('fs');
const p = 'C:/Users/sasat/.gemini/antigravity/brain/eca0ffe3-ae72-4bd3-aaad-f537af0ed270/.system_generated/logs/transcript.jsonl';
if (fs.existsSync(p)) {
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  for (let idx = 43; idx < lines.length; idx++) {
    try {
      const d = JSON.parse(lines[idx]);
      if (d.type === 'PLANNER_RESPONSE') {
        console.log(`Plan [${idx}]:`, (d.content || '').slice(0, 300));
        if (d.thinking) console.log(`  Thinking:`, d.thinking.slice(0, 300));
        if (d.tool_calls) {
          d.tool_calls.forEach(tc => console.log('  Tool:', tc.name, JSON.stringify(tc.args).slice(0, 150)));
        }
      }
    } catch(e) {}
  }
}

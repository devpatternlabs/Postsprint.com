const fs = require('fs');

const dir = 'C:/Users/sasat/.gemini/antigravity/brain';
const convs = ['31d4aeb6-0b77-4352-8ab9-799246dd1032', 'c7b8e728-13b2-42ba-a1ae-03d520748c2a', '6455d5df-9d2a-412a-8740-d1506953e682'];

convs.forEach(c => {
  const p = `${dir}/${c}/.system_generated/logs/transcript.jsonl`;
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
    console.log(`\n=== Conv ${c} (lines: ${lines.length}) ===`);
    lines.forEach((l, idx) => {
      try {
        const d = JSON.parse(l);
        if (d.type === 'USER_INPUT') {
          console.log(`  Step ${idx}: ${d.content.slice(0, 150).replace(/\n/g, ' ')}`);
        }
      } catch(e) {}
    });
  }
});

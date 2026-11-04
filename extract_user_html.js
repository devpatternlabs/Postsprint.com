const fs = require('fs');
const transcriptPath = 'C:/Users/sasat/.gemini/antigravity/brain/d26f5e35-7daa-4f8b-9fb0-f6e3f4bcf50c/.system_generated/logs/transcript_full.jsonl';

const line0 = fs.readFileSync(transcriptPath, 'utf8').split('\n')[0];
const data = JSON.parse(line0);

const htmlStart = data.content.indexOf('<!doctype html>');
if (htmlStart !== -1) {
  const userHtml = data.content.slice(htmlStart);
  fs.writeFileSync('user_provided_page.html', userHtml);
  console.log('Saved user_provided_page.html, length:', userHtml.length);
} else {
  console.log('<!doctype html> not found in content, checking index of <!DOCTYPE');
  const htmlStart2 = data.content.indexOf('<!DOCTYPE');
  console.log('htmlStart2:', htmlStart2);
}

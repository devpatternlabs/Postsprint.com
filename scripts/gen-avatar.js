const fs = require('fs');
const sharp = require('sharp');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="256" fill="url(#bg)"/>
  <circle cx="256" cy="186" r="84" fill="#ffffff"/>
  <path d="M118 420c0-76 61.8-138 138-138s138 62 138 138c0 14-11 26-25 26H143c-14 0-25-12-25-26z" fill="#ffffff"/>
</svg>`;

async function run() {
  const buf = Buffer.from(svg);
  await sharp(buf).webp({ quality: 95 }).toFile('mint-avatar.webp');
  await sharp(buf).jpeg({ quality: 95 }).toFile('mint-avatar.jpg');
  fs.writeFileSync('mint-avatar.svg', svg, 'utf8');
  console.log('Clean avatars generated successfully!');
}

run().catch(console.error);

const fs = require('fs');

function getPngDimensions(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  // IHDR chunk starts at offset 8, length at 8, type 'IHDR' at 12, width at 16, height at 20
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, size: buf.length };
}

const files = [
  'logo.png',
  'favicon.png',
  'apple-touch-icon.png',
  'assets/postsprint-icon.png',
  'assets/postsprint-nav-logo.png',
  'assets/test_decoded_footer_logo.png',
  'assets/test_decoded_logo.png'
];

files.forEach(f => {
  console.log(f, getPngDimensions(f));
});

const sharp = require('sharp');

async function getBBox(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const alpha = info.channels === 4 ? data[idx + 3] : 255;
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    width: info.width,
    height: info.height,
    bbox: { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
    aspectRatioOfContent: (maxX - minX + 1) / (maxY - minY + 1)
  };
}

async function run() {
  console.log('logo.png:', await getBBox('logo.png'));
  console.log('nav-logo:', await getBBox('assets/postsprint-nav-logo.png'));
}

run();

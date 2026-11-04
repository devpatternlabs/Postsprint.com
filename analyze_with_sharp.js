const sharp = require('sharp');
const fs = require('fs');

async function analyze() {
  const navMeta = await sharp('assets/postsprint-nav-logo.png').metadata();
  console.log('nav logo metadata:', navMeta);

  const footerMeta = await sharp('assets/test_decoded_footer_logo.png').metadata();
  console.log('footer logo metadata:', footerMeta);

  const logoMeta = await sharp('logo.png').metadata();
  console.log('logo.png metadata:', logoMeta);

  const userMeta = await sharp('C:/Users/sasat/.gemini/antigravity/brain/8d3393dc-54f9-43e5-939c-5480a340ffa8/.user_uploaded/media_1792075954459_ed41373e.jpg').metadata();
  console.log('user image 2 metadata:', userMeta);

  // Let's get raw pixel stats
  const { data: footerData, info: footerInfo } = await sharp('assets/test_decoded_footer_logo.png').raw().toBuffer({ resolveWithObject: true });
  // Find bounding box of non-transparent / non-black pixels in footer logo
  let minX = footerInfo.width, maxX = 0, minY = footerInfo.height, maxY = 0;
  let nonZeroCount = 0;
  for (let y = 0; y < footerInfo.height; y++) {
    for (let x = 0; x < footerInfo.width; x++) {
      const idx = (y * footerInfo.width + x) * footerInfo.channels;
      const alpha = footerInfo.channels === 4 ? footerData[idx + 3] : 255;
      const r = footerData[idx];
      const g = footerData[idx + 1];
      const b = footerData[idx + 2];
      if (alpha > 10 && (r > 10 || g > 10 || b > 10)) {
        nonZeroCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log('Footer logo bounding box of visible pixels:', { minX, maxX, minY, maxY, nonZeroCount, totalPixels: footerInfo.width * footerInfo.height });

  // Do the same for nav logo
  const { data: navData, info: navInfo } = await sharp('assets/postsprint-nav-logo.png').raw().toBuffer({ resolveWithObject: true });
  let nMinX = navInfo.width, nMaxX = 0, nMinY = navInfo.height, nMaxY = 0;
  let nNonZeroCount = 0;
  for (let y = 0; y < navInfo.height; y++) {
    for (let x = 0; x < navInfo.width; x++) {
      const idx = (y * navInfo.width + x) * navInfo.channels;
      const alpha = navInfo.channels === 4 ? navData[idx + 3] : 255;
      const r = navData[idx];
      const g = navData[idx + 1];
      const b = navData[idx + 2];
      if (alpha > 10 && (r > 10 || g > 10 || b > 10)) {
        nNonZeroCount++;
        if (x < nMinX) nMinX = x;
        if (x > nMaxX) nMaxX = x;
        if (y < nMinY) nMinY = y;
        if (y > nMaxY) nMaxY = y;
      }
    }
  }
  console.log('Nav logo bounding box of visible pixels:', { nMinX, nMaxX, nMinY, nMaxY, nNonZeroCount, totalPixels: navInfo.width * navInfo.height });
}

analyze().catch(console.error);

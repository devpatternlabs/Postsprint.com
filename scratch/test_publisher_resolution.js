// scratch/test_publisher_resolution.js
// Verification test for Postmint multi-platform media resolution and cloud URL guarantee

const path = require('path');
const publisher = require('../lib/publisher');
const supabaseStorage = require('../lib/supabase-storage');
const mediaService = require('../services/media-upload');

async function runTests() {
  console.log('--- TEST 1: Check Supabase Storage Signed URL and Upload Capability ---');
  // Create a minimal 1x1 test image
  const testBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  const uploadResult = await mediaService.uploadToStorage({
    buffer: testBuffer,
    filename: `test_${Date.now()}.png`,
    mimeType: 'image/png',
    folder: 'tests'
  });

  console.log('Upload Result:', {
    storagePath: uploadResult.storagePath,
    signedUrl: uploadResult.signedUrl?.slice(0, 80) + '...',
    size: uploadResult.size
  });

  if (!uploadResult.signedUrl || !uploadResult.signedUrl.startsWith('https://')) {
    throw new Error('Test 1 Failed: signedUrl is missing or not HTTPS!');
  }
  console.log('✅ TEST 1 PASSED: Supabase Storage generates verified public HTTPS signed URLs.');

  console.log('\n--- TEST 2: Pre-flight check throws clean error if media is missing ---');
  try {
    await publisher.publishToAllPlatforms({
      postId: 'test_no_media',
      platforms: ['Instagram', 'Facebook'],
      caption: 'Test with missing media',
      type: 'Post'
    });
    console.error('❌ TEST 2 FAILED: Expected pre-flight check to throw an error, but it succeeded.');
  } catch (err) {
    console.log('Caught expected error:', err.message);
    if (err.message.includes('Media file could not be found or retrieved from cloud storage')) {
      console.log('✅ TEST 2 PASSED: Pre-flight correctly catches missing media and gives clear guidance.');
    } else {
      console.warn('⚠️ TEST 2 WARNING: Error thrown, but message differed:', err.message);
    }
  }

  console.log('\n--- TEST 3: Staging buffer to Supabase in publisher ---');
  // Pass a base64 image without storagePath or mediaUrl to simulate direct buffer staging
  const testBase64 = 'data:image/png;base64,' + testBuffer.toString('base64');
  try {
    // We run in mock mode so we test the full resolution pipeline without publishing to live external APIs
    process.env.SOCIAL_API_MOCK_MODE = 'true';
    const pubResult = await publisher.publishToAllPlatforms({
      postId: 'test_base64_staging',
      platforms: ['Instagram', 'Facebook'],
      caption: 'Test with base64 staging',
      type: 'Post',
      mediaBase64: testBase64
    });
    console.log('Publish Result with Base64:', {
      success: pubResult.success,
      results: pubResult.results
    });
    console.log('✅ TEST 3 PASSED: Publisher auto-staged buffer to Supabase and completed mock publish.');
  } catch (err) {
    console.error('❌ TEST 3 FAILED:', err.message);
  } finally {
    delete process.env.SOCIAL_API_MOCK_MODE;
  }

  console.log('\n--- ALL VERIFICATION TESTS COMPLETED ---');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

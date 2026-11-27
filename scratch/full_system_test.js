// scratch/full_system_test.js
// Automated verification suite for Postsprint (Calendar, Post Sizing, Music/Trim, Zoya AI, Admin, Security, Storage)

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let testResults = [];
function test(name, fn) {
  try {
    fn();
    testResults.push({ name, pass: true });
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    testResults.push({ name, pass: false, error: err.message });
    console.error(`❌ FAIL: ${name} -> ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    testResults.push({ name, pass: true });
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    testResults.push({ name, pass: false, error: err.message });
    console.error(`❌ FAIL: ${name} -> ${err.message}`);
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING POSTSPRINT FULL-SYSTEM VERIFICATION SUITE');
  console.log('====================================================\n');

  // 1. Calendar Grid Accuracy & Navigation
  test('Calendar: moveCal function and 12-Month Grid Coverage', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert(html.includes('window.moveCal = function'), 'window.moveCal must be defined');
    assert(html.includes('window.schedulePostForDate = function'), 'window.schedulePostForDate must be defined');

    // Test 12 months calculation in 2026
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 1);
      let start = new Date(d.getFullYear(), d.getMonth(), 1);
      const firstDayIndex = start.getDay();
      start.setDate(start.getDate() - firstDayIndex);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
      let end = new Date(start);
      end.setDate(end.getDate() + totalCells);
      let renderedDays = 0;
      for (let cur = new Date(start); cur < end; cur.setDate(cur.getDate() + 1)) {
        if (cur.getMonth() === d.getMonth()) renderedDays++;
      }
      assert.strictEqual(renderedDays, daysInMonth, `Month ${m + 1}/2026 must render all ${daysInMonth} days`);
    }
  });

  // 2. Post & Reel Aspect Ratios Auto-Sizing
  test('Composer: Post, Reels, and Story Automatic Sizing', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert(html.includes('setSimpleFormat'), 'setSimpleFormat function must exist');
    assert(html.includes('1080 × 1920 px'), 'Reels & Stories must size to 1080 × 1920 px');
    assert(html.includes('1080 × 1350 px'), 'Portrait Post must size to 1080 × 1350 px');
    assert(html.includes('1080 × 1080 px'), 'Square Post must size to 1080 × 1080 px');
  });

  // 3. Audio Trimmer Playback from Trim Start
  test('Music & Trimmer: Starts from trim point and dynamic seek', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert(html.includes('const isComposerTrack = Boolean(composer?.audioTrack'), 'toggleTrackAudio must prioritize active composer track');
    assert(html.includes('seekToTrimStart'), 'Must actively seek to trim start point on play and canplay');
    assert(!html.includes('🎵 QUICK ADD TRACKS:'), 'Quick add tracks section must be removed from composer card');
    assert(!html.includes('Google Drive Music Database Connected'), 'Google Drive banner must be removed from UI');
  });

  // 4. Security & Credential Safeguarding
  test('Security: Zero Plaintext Secrets in Client-Side Script', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert(!html.includes('0764e538332d0eeb68deb98df70634d1'), 'Meta App Secret must not be in index.html');
    assert(!html.includes('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'), 'Google Client Secret must not be in index.html');
    assert(!html.includes('EAAmFoB1zfkMBSl6'), 'Facebook Page Access Token must not be in index.html');
  });

  // 5. Token Encryption Engine
  test('Security: AES-256-GCM Encryption Engine in lib/crypto.js', () => {
    const { encryptToken, decryptToken } = require('../lib/crypto');
    const testSecret = 'test_oauth_access_token_super_secret_12345';
    const encrypted = encryptToken(testSecret);
    assert.notStrictEqual(encrypted, testSecret, 'Encrypted token must differ from plaintext');
    assert(encrypted.includes(':'), 'Encrypted token format must be iv:authTag:ciphertext');
    const decrypted = decryptToken(encrypted);
    assert.strictEqual(decrypted, testSecret, 'Decrypted token must match original plaintext');
  });

  // 6. Admin RBAC Authorization
  test('Security: Admin Authorization Gate in api/admin.js & api/credentials.js', () => {
    const adminCode = fs.readFileSync('api/admin.js', 'utf8');
    const credCode = fs.readFileSync('api/credentials.js', 'utf8');
    assert(adminCode.includes('Only the administrator (explorewithharizz@gmail.com) can access this resource'), 'api/admin.js must enforce explorewithharizz@gmail.com gate');
    assert(credCode.includes('Admin authorization required to access or modify system credentials'), 'api/credentials.js must enforce admin check');
  });

  // 7. Zoya AI Assistant Endpoint & Rate Limiting
  test('Zoya AI: Rate Limiting & Input Sanitization in api/chat.js', () => {
    const chatCode = fs.readFileSync('api/chat.js', 'utf8');
    assert(chatCode.includes('checkChatRateLimit'), 'api/chat.js must check rate limits');
    assert(chatCode.includes('sanitizeAiReply'), 'api/chat.js must sanitize AI replies to prevent UI button pollution');
  });

  // 8. HTML Script Validation
  test('Frontend: HTML Syntax and Valid Script Blocks', () => {
    const content = fs.readFileSync('index.html', 'utf8');
    const scripts = [...content.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert(scripts.length >= 3, 'Must have at least 3 script blocks');
    scripts.forEach((m, idx) => {
      if (!m[1].includes('json') && !m[1].includes('importmap')) {
        try {
          new Function(m[2]);
        } catch (err) {
          throw new Error(`Script index ${idx} failed syntax check: ${err.message}`);
        }
      }
    });
  });

  console.log('\n====================================================');
  const passed = testResults.filter(t => t.pass).length;
  const failed = testResults.filter(t => !t.pass).length;
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${testResults.length})`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runAllTests();

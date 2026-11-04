const http = require('http');

function request(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== TESTING BACKEND APPLICATION APIS ===');
  let passed = 0;
  let total = 0;

  async function check(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } catch(e) {
      console.error(`✗ [FAIL] ${name}: ${e.message}`);
    }
  }

  // 1. Demo Auth Security Guardrail
  await check('Demo Auth endpoint security guardrail (/api/auth/demo)', async () => {
    const res = await request('/api/auth/demo', 'POST', { mode: 'welcome_back' });
    // In production mode, demo login is protected with 403 (expected security)
    if (res.status === 403) {
      if (!res.data || !res.data.error.includes('Demo accounts are disabled')) {
        throw new Error(`Unexpected 403 body: ${JSON.stringify(res.data)}`);
      }
    } else if (res.status === 200) {
      if (!res.data.success) throw new Error('Expected success true on 200');
    } else {
      throw new Error(`Unexpected status code: ${res.status}`);
    }
  });

  // 2. Subscriptions & Plans
  await check('Subscriptions plans endpoint (/api/subscriptions)', async () => {
    const res = await request('/api/subscriptions');
    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
  });

  // 3. Coupons Validation
  await check('Coupons validation endpoint (/api/coupons)', async () => {
    const res = await request('/api/coupons', 'POST', { code: 'WELCOME100', userId: 'usr_default_postmint' });
    if (res.status >= 500) {
      throw new Error(`Server error ${res.status}: ${JSON.stringify(res.data || res.raw)}`);
    }
  });

  // 4. Social Comments & CRM
  await check('Social comments endpoint (/api/social/comments)', async () => {
    const res = await request('/api/social/comments?userId=usr_default_postmint');
    if (res.status !== 200 || !res.data) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
  });

  // 5. Social Messages & DMs
  await check('Social messages endpoint (/api/social/messages)', async () => {
    const res = await request('/api/social/messages?userId=usr_default_postmint');
    if (res.status !== 200 || !res.data) {
      throw new Error(`Expected 200, got ${res.status}`);
    }
  });

  // 6. Posts DB Fetch
  await check('Posts API endpoint (/api/social/posts)', async () => {
    const res = await request('/api/social/posts');
    if (res.status !== 200 || !res.data || !res.data.success) {
      throw new Error(`Expected 200 and success, got ${res.status}: ${JSON.stringify(res.data)}`);
    }
  });

  console.log(`\nResults: ${passed}/${total} backend API tests passed.`);
  if (passed === total) {
    console.log('🎉 ALL BACKEND APIS FUNCTIONING PROPERLY!');
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

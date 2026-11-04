#!/usr/bin/env node
/**
 * ==============================================================================
 * PostFlow & Postmint - Dedicated Social Media Accounts Auto-Configuration File
 * ==============================================================================
 * This automated tool configures ONLY the social media platform accounts:
 *   - Meta (Instagram Graph API & Facebook Page API)
 *   - Google (YouTube Data API v3 & OAuth 2.0)
 *   - Snapchat (Snapchat Kit / Creative Kit)
 *   - ShareChat (Partner API / Intent Adapter)
 *   - Mock Mode Toggle (Instant test mode without live API credentials)
 *
 * NOTE: This tool strictly modifies and configures ONLY social media accounts.
 * Database (Supabase), encryption keys, AI keys, and other infrastructure
 * variables are preserved and left untouched.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// Social media keys managed by this configuration tool
const SOCIAL_KEYS = [
  'SOCIAL_API_MOCK_MODE',
  'NEXT_PUBLIC_SOCIAL_API_MOCK_MODE',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_REDIRECT_URI',
  'FACEBOOK_PAGE_ID',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'INSTAGRAM_ACCOUNT_ID',
  'INSTAGRAM_ACCESS_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'SNAPCHAT_CLIENT_ID',
  'SNAPCHAT_REDIRECT_URI',
  'SHARECHAT_PARTNER_API_TOKEN',
  'CUSTOM_SITE_NAME',
  'CUSTOM_SITE_URL',
  'CUSTOM_SITE_WEBHOOK',
  'CUSTOM_SITE_TOKEN',
];

// Locate target .env.local file
function resolveEnvPath() {
  const possiblePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), 'auto', '.env.local'),
    path.join(__dirname, 'auto', '.env.local'),
    path.join(__dirname, '.env.local'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback: check if 'auto' directory exists
  if (fs.existsSync(path.join(process.cwd(), 'auto'))) {
    return path.join(process.cwd(), 'auto', '.env.local');
  }
  return path.join(process.cwd(), '.env.local');
}

// Parse an environment file into key-value pairs
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let key = match[1];
      let value = match[2] || '';
      // Remove enclosing quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1);
      }
      env[key] = value;
    }
  }
  return env;
}

// Save social media keys to target .env file safely
function saveSocialKeysToEnv(targetPath, socialConfig) {
  let existingContent = '';
  if (fs.existsSync(targetPath)) {
    existingContent = fs.readFileSync(targetPath, 'utf8');
  }

  // Backup existing file
  if (existingContent.length > 0) {
    const backupPath = `${targetPath}.backup.${Date.now()}`;
    try {
      fs.writeFileSync(backupPath, existingContent, 'utf8');
    } catch {}
  }

  let updatedContent = existingContent;

  for (const key of SOCIAL_KEYS) {
    if (socialConfig[key] !== undefined) {
      const val = socialConfig[key];
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const formattedVal = val.includes(' ') || val.includes('"') ? `"${val}"` : val;

      if (regex.test(updatedContent)) {
        updatedContent = updatedContent.replace(regex, `${key}=${formattedVal}`);
      } else {
        // Append under appropriate social section
        updatedContent += `\n${key}=${formattedVal}`;
      }
    }
  }

  fs.writeFileSync(targetPath, updatedContent.trim() + '\n', 'utf8');
}

// Generate standalone social media accounts files
function exportDedicatedSocialFiles(socialConfig) {
  const envContent = `# ==============================================================================
# POSTFLOW / POSTMINT - SOCIAL MEDIA ACCOUNTS CONFIGURATION ONLY
# Generated on: ${new Date().toISOString()}
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. DEVELOPMENT MOCK MODE
# ------------------------------------------------------------------------------
# Set to 'true' for local testing without real API credentials.
# Set to 'false' to enable live Instagram, Facebook, YouTube, Snapchat publishing.
SOCIAL_API_MOCK_MODE=${socialConfig.SOCIAL_API_MOCK_MODE ?? 'true'}
NEXT_PUBLIC_SOCIAL_API_MOCK_MODE=${socialConfig.NEXT_PUBLIC_SOCIAL_API_MOCK_MODE ?? 'true'}

# ------------------------------------------------------------------------------
# 2. META DEVELOPER APP (Instagram Graph API & Facebook Pages)
# ------------------------------------------------------------------------------
# Obtain from developers.facebook.com -> App Dashboard -> Settings -> Basic
# Required Products: Facebook Login for Business, Instagram Graph API
META_APP_ID=${socialConfig.META_APP_ID || ''}
META_APP_SECRET=${socialConfig.META_APP_SECRET || ''}
META_REDIRECT_URI=${socialConfig.META_REDIRECT_URI || 'http://localhost:3000/api/oauth/meta/callback'}

# ------------------------------------------------------------------------------
# 3. GOOGLE CLOUD CONSOLE (YouTube Data API v3 & OAuth 2.0)
# ------------------------------------------------------------------------------
# Obtain from console.cloud.google.com -> Credentials -> OAuth 2.0 Client IDs
# Enabled API: YouTube Data API v3
# Scopes: openid, email, profile, https://www.googleapis.com/auth/youtube.upload
GOOGLE_CLIENT_ID=${socialConfig.GOOGLE_CLIENT_ID || ''}
GOOGLE_CLIENT_SECRET=${socialConfig.GOOGLE_CLIENT_SECRET || ''}
GOOGLE_REDIRECT_URI=${socialConfig.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/youtube/callback'}

# ------------------------------------------------------------------------------
# 4. SNAPCHAT (Snapchat Kit / Creative Kit)
# ------------------------------------------------------------------------------
# Obtain from kit.snapchat.com
# Creative Kit sharing works out-of-the-box even without Client ID.
SNAPCHAT_CLIENT_ID=${socialConfig.SNAPCHAT_CLIENT_ID || ''}
SNAPCHAT_REDIRECT_URI=${socialConfig.SNAPCHAT_REDIRECT_URI || 'http://localhost:3000/api/auth/snapchat/callback'}

# ------------------------------------------------------------------------------
# 5. SHARECHAT (Partner API / Guided Share)
# ------------------------------------------------------------------------------
# Optional Partner API Token for direct server-side post creation.
# If omitted, guided one-click manual share flow is used.
SHARECHAT_PARTNER_API_TOKEN=${socialConfig.SHARECHAT_PARTNER_API_TOKEN || ''}
`;

  const jsonContent = JSON.stringify(
    {
      _info: 'PostFlow & Postmint Social Media Accounts Configuration',
      generatedAt: new Date().toISOString(),
      mockMode: socialConfig.SOCIAL_API_MOCK_MODE === 'true',
      platforms: {
        meta: {
          platformName: 'Instagram & Facebook',
          appId: socialConfig.META_APP_ID || null,
          appSecretConfigured: Boolean(socialConfig.META_APP_SECRET),
          redirectUri: socialConfig.META_REDIRECT_URI || 'http://localhost:3000/api/oauth/meta/callback',
        },
        youtube: {
          platformName: 'YouTube Data API v3',
          clientId: socialConfig.GOOGLE_CLIENT_ID || null,
          clientSecretConfigured: Boolean(socialConfig.GOOGLE_CLIENT_SECRET),
          redirectUri: socialConfig.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/youtube/callback',
        },
        snapchat: {
          platformName: 'Snapchat Creative Kit & OAuth',
          clientId: socialConfig.SNAPCHAT_CLIENT_ID || null,
          redirectUri: socialConfig.SNAPCHAT_REDIRECT_URI || 'http://localhost:3000/api/auth/snapchat/callback',
        },
        sharechat: {
          platformName: 'ShareChat Partner API',
          partnerTokenConfigured: Boolean(socialConfig.SHARECHAT_PARTNER_API_TOKEN),
        },
      },
    },
    null,
    2
  );

  const envOut = path.join(process.cwd(), 'social-accounts.env');
  const jsonOut = path.join(process.cwd(), 'social-accounts.config.json');

  fs.writeFileSync(envOut, envContent, 'utf8');
  fs.writeFileSync(jsonOut, jsonContent, 'utf8');

  // Also write into auto/ if it exists
  const autoDir = path.join(process.cwd(), 'auto');
  if (fs.existsSync(autoDir)) {
    fs.writeFileSync(path.join(autoDir, 'social-accounts.env'), envContent, 'utf8');
    fs.writeFileSync(path.join(autoDir, 'social-accounts.config.json'), jsonContent, 'utf8');
  }

  return { envOut, jsonOut };
}

// Mask sensitive secrets for terminal display
function maskSecret(val) {
  if (!val) return `${colors.dim}(not set)${colors.reset}`;
  if (val.length <= 6) return '******';
  return `${val.substring(0, 3)}...${val.substring(val.length - 3)}`;
}

// Print formatted status of social accounts
function printSocialStatus(env, envPath) {
  const isMock = env.SOCIAL_API_MOCK_MODE === 'true' || env.NEXT_PUBLIC_SOCIAL_API_MOCK_MODE === 'true';

  console.log('\n' + colors.bright + colors.cyan + '==========================================================' + colors.reset);
  console.log(colors.bright + colors.cyan + '      SOCIAL MEDIA ACCOUNTS CONFIGURATION STATUS          ' + colors.reset);
  console.log(colors.bright + colors.cyan + '==========================================================' + colors.reset);
  console.log(`${colors.dim}Target config file:${colors.reset} ${envPath}`);
  console.log(
    `${colors.dim}Mock Mode:${colors.reset} ${
      isMock
        ? colors.yellow + 'ENABLED (Demo & Test Mode without live APIs)' + colors.reset
        : colors.green + 'DISABLED (Live Social Publishing Active)' + colors.reset
    }`
  );
  console.log('----------------------------------------------------------');

  // 1. Meta (Instagram & Facebook)
  const metaOk = Boolean(env.META_APP_ID && env.META_APP_SECRET);
  console.log(
    `${colors.bright}1. Meta (Instagram & Facebook Page):${colors.reset} ` +
      (metaOk ? `${colors.green}✓ Configured${colors.reset}` : `${colors.yellow}⚠ Incomplete${colors.reset}`)
  );
  console.log(`   - App ID:       ${env.META_APP_ID || `${colors.dim}(not set)${colors.reset}`}`);
  console.log(`   - App Secret:   ${maskSecret(env.META_APP_SECRET)}`);
  console.log(`   - Redirect URI: ${env.META_REDIRECT_URI || 'http://localhost:3000/api/oauth/meta/callback'}`);
  console.log(`   - Whitelist in Meta Console:`);
  console.log(`     * Local: http://localhost:3000/api/oauth/meta/callback`);
  console.log(`     * Prod:  https://postmint-studio.vercel.app/api/oauth/meta/callback`);
  if (env.FACEBOOK_PAGE_ID || env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    console.log(`   - Direct FB Page ID:    ${env.FACEBOOK_PAGE_ID || `${colors.dim}(not set)${colors.reset}`}`);
    console.log(`   - Direct FB Page Token: ${maskSecret(env.FACEBOOK_PAGE_ACCESS_TOKEN)}`);
  }
  if (env.INSTAGRAM_ACCOUNT_ID || env.INSTAGRAM_ACCESS_TOKEN) {
    console.log(`   - Direct IG Account ID: ${env.INSTAGRAM_ACCOUNT_ID || `${colors.dim}(not set)${colors.reset}`}`);
    console.log(`   - Direct IG Token:      ${maskSecret(env.INSTAGRAM_ACCESS_TOKEN)}`);
  }

  // 2. YouTube (Google)
  const ytOk = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  console.log(
    `\n${colors.bright}2. Google (YouTube Data API v3):${colors.reset} ` +
      (ytOk ? `${colors.green}✓ Configured${colors.reset}` : `${colors.yellow}⚠ Incomplete${colors.reset}`)
  );
  console.log(`   - Client ID:     ${env.GOOGLE_CLIENT_ID ? env.GOOGLE_CLIENT_ID.substring(0, 24) + '...' : `${colors.dim}(not set)${colors.reset}`}`);
  console.log(`   - Client Secret: ${maskSecret(env.GOOGLE_CLIENT_SECRET)}`);
  console.log(`   - Redirect URI:  ${env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/youtube/callback'}`);

  // 3. Snapchat
  const snapOk = Boolean(env.SNAPCHAT_CLIENT_ID);
  console.log(
    `\n${colors.bright}3. Snapchat (Creative Kit & OAuth):${colors.reset} ` +
      (snapOk ? `${colors.green}✓ Client ID set${colors.reset}` : `${colors.cyan}ℹ Creative Kit Sharing ready${colors.reset}`)
  );
  console.log(`   - Client ID:     ${env.SNAPCHAT_CLIENT_ID || `${colors.dim}(Optional - uses Creative Kit by default)${colors.reset}`}`);

  // 4. ShareChat
  const shareOk = Boolean(env.SHARECHAT_PARTNER_API_TOKEN);
  console.log(
    `\n${colors.bright}4. ShareChat (Partner API & Intent):${colors.reset} ` +
      (shareOk ? `${colors.green}✓ Partner API configured${colors.reset}` : `${colors.cyan}ℹ Manual Guided Share active${colors.reset}`)
  );
  console.log(`   - Partner Token: ${maskSecret(env.SHARECHAT_PARTNER_API_TOKEN)}`);

  // 5. Connected New Site / Custom Destination
  console.log(
    `\n${colors.bright}5. Connected Site / Custom Destination:${colors.reset} ` +
      (env.CUSTOM_SITE_URL ? `${colors.green}✓ ${env.CUSTOM_SITE_NAME || 'Custom Site'}${colors.reset}` : `${colors.cyan}ℹ Default (Postmint Studio on http://localhost:3001)${colors.reset}`)
  );
  console.log(`   - Site URL:      ${env.CUSTOM_SITE_URL || 'http://localhost:3001'}`);
  console.log(`   - Webhook / API: ${env.CUSTOM_SITE_WEBHOOK || 'http://localhost:3001/api/chat'}`);

  console.log('----------------------------------------------------------\n');
}

// Ask question helper using readline
function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask: (query, defaultVal = '') =>
      new Promise((resolve) => {
        const prompt = defaultVal ? `${query} [${defaultVal}]: ` : `${query}: `;
        rl.question(prompt, (answer) => {
          resolve(answer.trim() || defaultVal);
        });
      }),
    close: () => rl.close(),
  };
}

// Main interactive configuration flow
async function runInteractiveConfig() {
  const envPath = resolveEnvPath();
  const currentEnv = parseEnv(envPath);

  console.log(colors.bright + colors.magenta + '\n╔══════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bright + colors.magenta + '║   POSTFLOW / POSTMINT: SOCIAL MEDIA ACCOUNTS CONFIG WIZARD║' + colors.reset);
  console.log(colors.bright + colors.magenta + '╚══════════════════════════════════════════════════════════╝' + colors.reset);
  console.log(`${colors.dim}This auto configuration file configures ONLY your social accounts.${colors.reset}\n`);

  printSocialStatus(currentEnv, envPath);

  const prompter = createPrompter();

  console.log(colors.bright + 'Choose an action:' + colors.reset);
  console.log('  1) Guided step-by-step Social Accounts Setup');
  console.log('  2) 1-Click Toggle Mock Mode (Demo all social accounts without API keys)');
  console.log('  3) Export dedicated standalone config files (social-accounts.env & .json)');
  console.log('  4) Validate current credentials syntax & callback URIs');
  console.log('  5) Exit\n');

  const choice = await prompter.ask('Enter choice (1-5)', '1');

  if (choice === '5') {
    console.log('Exiting without changes.');
    prompter.close();
    return;
  }

  if (choice === '2') {
    const isMock = currentEnv.SOCIAL_API_MOCK_MODE === 'true';
    const newMockVal = isMock ? 'false' : 'true';
    const update = {
      SOCIAL_API_MOCK_MODE: newMockVal,
      NEXT_PUBLIC_SOCIAL_API_MOCK_MODE: newMockVal,
    };
    saveSocialKeysToEnv(envPath, update);
    exportDedicatedSocialFiles({ ...currentEnv, ...update });
    console.log(
      `\n${colors.green}✓ Social API Mock Mode is now: ${
        newMockVal === 'true' ? 'ENABLED (Testing mode)' : 'DISABLED (Live mode)'
      }${colors.reset}\n`
    );
    prompter.close();
    return;
  }

  if (choice === '3') {
    const files = exportDedicatedSocialFiles(currentEnv);
    console.log(`\n${colors.green}✓ Dedicated social accounts files created:${colors.reset}`);
    console.log(`  - ${files.envOut}`);
    console.log(`  - ${files.jsonOut}\n`);
    prompter.close();
    return;
  }

  if (choice === '4') {
    validateSocialCredentials(currentEnv);
    prompter.close();
    return;
  }

  // Choice 1: Guided step-by-step
  console.log('\n' + colors.bright + colors.blue + '--- [1/4] META (INSTAGRAM & FACEBOOK) CONFIGURATION ---' + colors.reset);
  console.log(colors.dim + 'Obtain from: https://developers.facebook.com -> App Dashboard' + colors.reset);
  const metaAppId = await prompter.ask('Meta App ID', currentEnv.META_APP_ID || '');
  const metaAppSecret = await prompter.ask('Meta App Secret', currentEnv.META_APP_SECRET || '');
  const metaRedirect = await prompter.ask(
    'Meta OAuth Redirect URI',
    currentEnv.META_REDIRECT_URI || 'http://localhost:3000/api/oauth/meta/callback'
  );

  console.log('\n' + colors.bright + colors.red + '--- [2/4] GOOGLE & YOUTUBE CONFIGURATION ---' + colors.reset);
  console.log(colors.dim + 'Obtain from: https://console.cloud.google.com -> Credentials -> OAuth 2.0 Client IDs' + colors.reset);
  const googleClientId = await prompter.ask('Google Client ID', currentEnv.GOOGLE_CLIENT_ID || '');
  const googleClientSecret = await prompter.ask('Google Client Secret', currentEnv.GOOGLE_CLIENT_SECRET || '');
  const googleRedirect = await prompter.ask(
    'Google OAuth Redirect URI',
    currentEnv.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/youtube/callback'
  );

  console.log('\n' + colors.bright + colors.yellow + '--- [3/4] SNAPCHAT CONFIGURATION ---' + colors.reset);
  console.log(colors.dim + 'Obtain from: https://kit.snapchat.com (Optional - Creative Kit Sharing works automatically)' + colors.reset);
  const snapchatClientId = await prompter.ask('Snapchat Client ID (optional)', currentEnv.SNAPCHAT_CLIENT_ID || '');

  console.log('\n' + colors.bright + colors.cyan + '--- [4/4] SHARECHAT CONFIGURATION ---' + colors.reset);
  console.log(colors.dim + 'ShareChat Partner API Token (optional - leave blank for guided 1-click share flow)' + colors.reset);
  const sharechatToken = await prompter.ask('ShareChat Partner API Token (optional)', currentEnv.SHARECHAT_PARTNER_API_TOKEN || '');

  console.log('\n' + colors.bright + '--- MOCK MODE / LIVE MODE ---' + colors.reset);
  const defaultMock = metaAppId && googleClientId ? 'false' : 'true';
  const mockAnswer = await prompter.ask('Enable Mock Mode for testing? (true/false)', currentEnv.SOCIAL_API_MOCK_MODE || defaultMock);
  const isMock = mockAnswer.toLowerCase() === 'true';

  prompter.close();

  const newConfig = {
    SOCIAL_API_MOCK_MODE: isMock ? 'true' : 'false',
    NEXT_PUBLIC_SOCIAL_API_MOCK_MODE: isMock ? 'true' : 'false',
    META_APP_ID: metaAppId.trim(),
    META_APP_SECRET: metaAppSecret.trim(),
    META_REDIRECT_URI: metaRedirect.trim(),
    GOOGLE_CLIENT_ID: googleClientId.trim(),
    GOOGLE_CLIENT_SECRET: googleClientSecret.trim(),
    GOOGLE_REDIRECT_URI: googleRedirect.trim(),
    SNAPCHAT_CLIENT_ID: snapchatClientId.trim(),
    SHARECHAT_PARTNER_API_TOKEN: sharechatToken.trim(),
  };

  saveSocialKeysToEnv(envPath, newConfig);
  const exported = exportDedicatedSocialFiles({ ...currentEnv, ...newConfig });

  console.log('\n' + colors.bright + colors.green + '==========================================================' + colors.reset);
  console.log(colors.bright + colors.green + '✓ SOCIAL MEDIA ACCOUNTS CONFIGURATION SAVED SUCCESSFULLY! ' + colors.reset);
  console.log(colors.bright + colors.green + '==========================================================' + colors.reset);
  console.log(`Updated environment: ${envPath}`);
  console.log(`Created dedicated file: ${exported.envOut}`);
  console.log(`Created JSON file:       ${exported.jsonOut}\n`);
}

// Validator helper
function validateSocialCredentials(env) {
  console.log('\n' + colors.bright + '=== Validating Social Media Credentials Syntax ===' + colors.reset);
  let issues = 0;

  // Meta validation
  if (env.META_APP_ID) {
    if (!/^\d+$/.test(env.META_APP_ID)) {
      console.log(`${colors.yellow}⚠ Meta App ID usually consists only of numbers (e.g. 1638858091004061).${colors.reset}`);
      issues++;
    } else {
      console.log(`${colors.green}✓ Meta App ID format looks valid.${colors.reset}`);
    }
  } else {
    console.log(`${colors.dim}ℹ Meta App ID is not set.${colors.reset}`);
  }

  if (env.META_APP_SECRET) {
    if (!/^[a-f0-9]{32}$/i.test(env.META_APP_SECRET)) {
      console.log(`${colors.yellow}⚠ Meta App Secret is typically a 32-character hexadecimal string.${colors.reset}`);
      issues++;
    } else {
      console.log(`${colors.green}✓ Meta App Secret format looks valid.${colors.reset}`);
    }
  }

  // Google validation
  if (env.GOOGLE_CLIENT_ID) {
    if (!env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
      console.log(`${colors.yellow}⚠ Google Client ID typically ends with .apps.googleusercontent.com.${colors.reset}`);
      issues++;
    } else {
      console.log(`${colors.green}✓ Google Client ID format looks valid.${colors.reset}`);
    }
  } else {
    console.log(`${colors.dim}ℹ Google Client ID is not set.${colors.reset}`);
  }

  if (env.GOOGLE_CLIENT_SECRET) {
    if (!env.GOOGLE_CLIENT_SECRET.startsWith('GOCSPX-')) {
      console.log(`${colors.yellow}ℹ Note: Modern Google OAuth secrets usually start with GOCSPX-.${colors.reset}`);
    } else {
      console.log(`${colors.green}✓ Google Client Secret format looks valid.${colors.reset}`);
    }
  }

  // Redirect URIs
  const checkUrl = (url, name) => {
    try {
      new URL(url);
      console.log(`${colors.green}✓ ${name} redirect URI is a valid URL: ${url}${colors.reset}`);
    } catch {
      console.log(`${colors.red}✗ ${name} redirect URI is NOT a valid URL: ${url}${colors.reset}`);
      issues++;
    }
  };

  if (env.META_REDIRECT_URI) checkUrl(env.META_REDIRECT_URI, 'Meta');
  if (env.GOOGLE_REDIRECT_URI) checkUrl(env.GOOGLE_REDIRECT_URI, 'Google');

  if (issues === 0) {
    console.log(`\n${colors.green}All configured social credentials passed syntax validation!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.yellow}Found ${issues} potential syntax warning(s). Double-check your developer dashboards.${colors.reset}\n`);
  }
}

// Command-line flags handling for automated non-interactive runs
function handleCliFlags() {
  const args = process.argv.slice(2);
  const envPath = resolveEnvPath();
  const currentEnv = parseEnv(envPath);

  if (args.includes('--status')) {
    printSocialStatus(currentEnv, envPath);
    process.exit(0);
  }

  if (args.includes('--mock')) {
    const update = {
      SOCIAL_API_MOCK_MODE: 'true',
      NEXT_PUBLIC_SOCIAL_API_MOCK_MODE: 'true',
    };
    saveSocialKeysToEnv(envPath, update);
    exportDedicatedSocialFiles({ ...currentEnv, ...update });
    console.log('\n[PostFlow] Social API Mock Mode has been ENABLED for all social accounts.\n');
    process.exit(0);
  }

  if (args.includes('--live')) {
    const update = {
      SOCIAL_API_MOCK_MODE: 'false',
      NEXT_PUBLIC_SOCIAL_API_MOCK_MODE: 'false',
    };
    saveSocialKeysToEnv(envPath, update);
    exportDedicatedSocialFiles({ ...currentEnv, ...update });
    console.log('\n[PostFlow] Social API Mock Mode has been DISABLED. Live APIs active.\n');
    process.exit(0);
  }

  if (args.includes('--export')) {
    const files = exportDedicatedSocialFiles(currentEnv);
    console.log(`\n[PostFlow] Dedicated social media account files generated:`);
    console.log(`- ${files.envOut}`);
    console.log(`- ${files.jsonOut}\n`);
    process.exit(0);
  }

  if (args.includes('--validate')) {
    validateSocialCredentials(currentEnv);
    process.exit(0);
  }

  // If no CLI flags, run interactive config wizard
  runInteractiveConfig().catch((err) => {
    console.error('Configuration error:', err);
    process.exit(1);
  });
}

// Entrypoint
handleCliFlags();

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const {
      googleClientId,
      googleClientSecret,
      googleRedirectUri,
      metaAppId,
      metaAppSecret,
      metaRedirectUri,
      snapchatClientId,
      snapchatRedirectUri,
      sharechatPartnerToken,
      socialMockMode,
      customSiteName,
      customSiteUrl,
      customSiteWebhook,
      customSiteToken,
    } = await request.json();

    const envPath = path.join(process.cwd(), ".env.local");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    const updateOrAppend = (key: string, value: string) => {
      process.env[key] = value;
      const regex = new RegExp(`^${key}=.*$`, "m");
      const formattedVal = value.includes(" ") || value.includes('"') ? `"${value}"` : value;
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${formattedVal}`);
      } else {
        envContent += `\n${key}=${formattedVal}`;
      }
    };

    if (socialMockMode !== undefined) {
      const mockStr = String(socialMockMode);
      updateOrAppend("SOCIAL_API_MOCK_MODE", mockStr);
      updateOrAppend("NEXT_PUBLIC_SOCIAL_API_MOCK_MODE", mockStr);
    }
    if (googleClientId !== undefined) {
      updateOrAppend("GOOGLE_CLIENT_ID", googleClientId.trim());
    }
    if (googleClientSecret !== undefined) {
      updateOrAppend("GOOGLE_CLIENT_SECRET", googleClientSecret.trim());
    }
    if (googleRedirectUri !== undefined && googleRedirectUri.trim()) {
      updateOrAppend("GOOGLE_REDIRECT_URI", googleRedirectUri.trim());
    }
    if (metaAppId !== undefined) {
      updateOrAppend("META_APP_ID", metaAppId.trim());
    }
    if (metaAppSecret !== undefined) {
      updateOrAppend("META_APP_SECRET", metaAppSecret.trim());
    }
    if (metaRedirectUri !== undefined && metaRedirectUri.trim()) {
      updateOrAppend("META_REDIRECT_URI", metaRedirectUri.trim());
    }
    if (snapchatClientId !== undefined) {
      updateOrAppend("SNAPCHAT_CLIENT_ID", snapchatClientId.trim());
    }
    if (snapchatRedirectUri !== undefined && snapchatRedirectUri.trim()) {
      updateOrAppend("SNAPCHAT_REDIRECT_URI", snapchatRedirectUri.trim());
    }
    if (sharechatPartnerToken !== undefined) {
      updateOrAppend("SHARECHAT_PARTNER_API_TOKEN", sharechatPartnerToken.trim());
    }
    if (customSiteName !== undefined) {
      updateOrAppend("CUSTOM_SITE_NAME", customSiteName.trim());
    }
    if (customSiteUrl !== undefined) {
      updateOrAppend("CUSTOM_SITE_URL", customSiteUrl.trim());
    }
    if (customSiteWebhook !== undefined) {
      updateOrAppend("CUSTOM_SITE_WEBHOOK", customSiteWebhook.trim());
    }
    if (customSiteToken !== undefined) {
      updateOrAppend("CUSTOM_SITE_TOKEN", customSiteToken.trim());
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf8");

    // Also export standalone social configuration files
    try {
      const socialEnvContent = `# ==============================================================================
# POSTFLOW - SOCIAL MEDIA ACCOUNTS CONFIGURATION ONLY
# Auto-saved on: ${new Date().toISOString()}
# ==============================================================================
SOCIAL_API_MOCK_MODE=${process.env.SOCIAL_API_MOCK_MODE || "true"}
NEXT_PUBLIC_SOCIAL_API_MOCK_MODE=${process.env.NEXT_PUBLIC_SOCIAL_API_MOCK_MODE || "true"}

META_APP_ID=${process.env.META_APP_ID || ""}
META_APP_SECRET=${process.env.META_APP_SECRET || ""}
META_REDIRECT_URI=${process.env.META_REDIRECT_URI || "http://localhost:3000/api/oauth/meta/callback"}

GOOGLE_CLIENT_ID=${process.env.GOOGLE_CLIENT_ID || ""}
GOOGLE_CLIENT_SECRET=${process.env.GOOGLE_CLIENT_SECRET || ""}
GOOGLE_REDIRECT_URI=${process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/youtube/callback"}

SNAPCHAT_CLIENT_ID=${process.env.SNAPCHAT_CLIENT_ID || ""}
SNAPCHAT_REDIRECT_URI=${process.env.SNAPCHAT_REDIRECT_URI || "http://localhost:3000/api/auth/snapchat/callback"}

SHARECHAT_PARTNER_API_TOKEN=${process.env.SHARECHAT_PARTNER_API_TOKEN || ""}
`;
      fs.writeFileSync(path.join(process.cwd(), "social-accounts.env"), socialEnvContent, "utf8");
      
      const parentDir = path.resolve(process.cwd(), "..");
      if (fs.existsSync(parentDir)) {
        fs.writeFileSync(path.join(parentDir, "social-accounts.env"), socialEnvContent, "utf8");
      }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save social media credentials" },
      { status: 500 }
    );
  }
}

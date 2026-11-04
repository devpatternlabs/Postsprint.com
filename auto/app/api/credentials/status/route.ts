import { NextResponse } from "next/server";

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const isMock =
    process.env.SOCIAL_API_MOCK_MODE === "true" ||
    process.env.NEXT_PUBLIC_SOCIAL_API_MOCK_MODE === "true";

  return NextResponse.json({
    mockMode: isMock,
    google: {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim().length > 5,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET.trim().length > 5,
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/youtube/callback`,
    },
    meta: {
      hasAppId: !!process.env.META_APP_ID && process.env.META_APP_ID.trim().length > 5,
      hasAppSecret: !!process.env.META_APP_SECRET && process.env.META_APP_SECRET.trim().length > 5,
      appId: process.env.META_APP_ID || "",
      redirectUri: process.env.META_REDIRECT_URI || `${appUrl}/api/oauth/meta/callback`,
    },
    snapchat: {
      hasClientId: !!process.env.SNAPCHAT_CLIENT_ID && process.env.SNAPCHAT_CLIENT_ID.trim().length > 3,
      clientId: process.env.SNAPCHAT_CLIENT_ID || "",
      redirectUri: process.env.SNAPCHAT_REDIRECT_URI || `${appUrl}/api/auth/snapchat/callback`,
    },
    sharechat: {
      hasPartnerToken: !!process.env.SHARECHAT_PARTNER_API_TOKEN && process.env.SHARECHAT_PARTNER_API_TOKEN.trim().length > 5,
    },
    customSite: {
      name: process.env.CUSTOM_SITE_NAME || "Postmint Studio",
      url: process.env.CUSTOM_SITE_URL || "http://localhost:3001",
      webhook: process.env.CUSTOM_SITE_WEBHOOK || "http://localhost:3001/api/chat",
      hasToken: !!process.env.CUSTOM_SITE_TOKEN,
    },
  });
}

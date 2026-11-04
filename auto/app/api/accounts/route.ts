import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getPersistedAccounts } from "@/lib/oauth/youtube-service";
import { getPersistedMetaAccounts } from "@/lib/oauth/meta-service";
import { getPersistedSnapchatAccounts } from "@/lib/oauth/snapchat-service";
import { getPersistedShareChatAccounts } from "@/lib/oauth/sharechat-service";

export const dynamic = "force-dynamic";

function mergeAccounts(baseAccounts: any[], userId: string): any[] {
  if (!userId) return [];
  const persisted = [
    ...getPersistedAccounts(userId),
    ...getPersistedMetaAccounts(userId),
    ...getPersistedSnapchatAccounts(userId),
    ...getPersistedShareChatAccounts(userId),
  ];
  const merged = [...baseAccounts];
  for (const pa of persisted) {
    const idx = merged.findIndex((a) => a.provider === pa.provider);
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...pa };
    } else {
      merged.push(pa);
    }
  }
  return merged;
}

export async function GET() {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    let dbAccounts: any[] = [];

    try {
      const admin = createAdminClient();
      // Query ONLY by current authenticated user's ID
      const { data, error } = await admin
        .from("social_accounts")
        .select("*")
        .eq("user_id", user.id);

      if (!error && data) {
        dbAccounts = data;
      }
    } catch (err) {
      console.warn("[Accounts API] Admin Supabase query warning:", err);
    }

    const merged = mergeAccounts(dbAccounts, user.id);
    console.log(`[Accounts API] Returning ${merged.length} accounts for user ${user.id} (${user.email})`);

    return NextResponse.json({ accounts: merged }, { headers });
  } catch (error: any) {
    console.error("[Accounts API Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch accounts" },
      { status: 500, headers }
    );
  }
}

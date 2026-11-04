import { NextResponse } from "next/server";
import { disconnectMeta } from "@/lib/oauth/meta-service";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`[Meta Disconnect] Disconnecting Meta for user: ${user.id}`);
    await disconnectMeta(user.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Meta Disconnect Route Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to disconnect Meta account" },
      { status: 500 }
    );
  }
}

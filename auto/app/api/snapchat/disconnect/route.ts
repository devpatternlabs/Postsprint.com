import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { disconnectSnapchat } from "@/lib/oauth/snapchat-service";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await disconnectSnapchat(user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to disconnect Snapchat" },
      { status: 500 }
    );
  }
}

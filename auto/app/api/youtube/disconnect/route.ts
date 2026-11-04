import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { disconnectYouTubeAccount } from "@/lib/oauth/youtube-service";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await disconnectYouTubeAccount(user.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[YouTube Disconnect Route Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to disconnect YouTube account" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { disconnectShareChat } from "@/lib/oauth/sharechat-service";

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await disconnectShareChat(user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to disconnect ShareChat" },
      { status: 500 }
    );
  }
}

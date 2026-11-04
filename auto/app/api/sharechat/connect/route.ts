import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { shareChatProvider } from "@/providers/sharechat";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await shareChatProvider.connect({ userId: user.id });
    return NextResponse.json({ success: true, account: res.account });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to connect ShareChat" },
      { status: 500 }
    );
  }
}

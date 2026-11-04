import { NextResponse } from "next/server";
import { getPendingMetaSession } from "@/lib/oauth/meta-service";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = getPendingMetaSession(user.id);
    if (!session || !session.pages || session.pages.length === 0) {
      return NextResponse.json({ pages: [] });
    }

    // Return safe page summaries without access tokens
    const pages = session.pages.map((p) => ({
      id: p.id,
      name: p.name,
      instagramAccount: p.instagramAccount
        ? {
            id: p.instagramAccount.id,
            username: p.instagramAccount.username,
            name: p.instagramAccount.name,
            profilePictureUrl: p.instagramAccount.profilePictureUrl,
          }
        : null,
    }));

    return NextResponse.json({ pages });
  } catch (error: any) {
    console.error("[Meta Pages Route Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve Facebook Pages" },
      { status: 500 }
    );
  }
}

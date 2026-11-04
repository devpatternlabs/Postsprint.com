import { NextRequest, NextResponse } from "next/server";
import {
  getPendingMetaSession,
  clearPendingMetaSession,
  saveMetaConnection,
} from "@/lib/oauth/meta-service";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { sendAccountConnectedEmail } from "@/lib/email/notification-service";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pageId } = await request.json();
    if (!pageId) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 });
    }

    const session = getPendingMetaSession(user.id);
    if (!session || !session.pages) {
      return NextResponse.json(
        { error: "Page selection session expired. Please start the connection again." },
        { status: 400 }
      );
    }

    const selectedPage = session.pages.find((p) => p.id === pageId);
    if (!selectedPage) {
      return NextResponse.json(
        { error: "Selected Facebook Page not found in authorized session" },
        { status: 404 }
      );
    }

    // Save selected page + detect linked Instagram
    await saveMetaConnection({
      appUserId: user.id,
      page: selectedPage,
      userAccessToken: session.userAccessToken,
      expiresIn: session.expiresIn,
    });

    // Send confirmation email asynchronously
    sendAccountConnectedEmail({
      to: user.email,
      platform: "facebook_instagram",
      pageName: selectedPage.name,
      instagramUsername: selectedPage.instagramAccount?.username,
    }).catch((err) => console.warn("[Email Notification Warning]:", err));

    // Clear temporary pending session
    clearPendingMetaSession(user.id);

    return NextResponse.json({
      success: true,
      pageName: selectedPage.name,
      instagramUsername: selectedPage.instagramAccount?.username || null,
    });
  } catch (error: any) {
    console.error("[Meta Select Page Route Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save selected Facebook Page" },
      { status: 500 }
    );
  }
}

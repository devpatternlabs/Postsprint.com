import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getConnectedMetaAccount } from "@/lib/oauth/meta-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ connected: false }, { headers });
    }

    const metaConn = await getConnectedMetaAccount(user.id);
    if (!metaConn) {
      return NextResponse.json({ connected: false }, { headers });
    }

    const { connection } = metaConn;

    return NextResponse.json(
      {
        connected: true,
        page: {
          id: connection.facebookPageId,
          name: connection.facebookPageName,
        },
        instagram: connection.instagramAccountId
          ? {
              id: connection.instagramAccountId,
              username: connection.instagramUsername,
              profilePicture: connection.instagramProfilePicture,
            }
          : null,
        tokenExpiresAt: connection.expiresAt,
      },
      { headers }
    );
  } catch (error: any) {
    console.error("[Meta Status Route Error]", error);
    return NextResponse.json(
      { connected: false, error: error?.message || "Failed to retrieve Meta status" },
      { status: 500, headers }
    );
  }
}

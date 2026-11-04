import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { snapchatProvider } from "@/providers/snapchat";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const res = await snapchatProvider.connect({ userId: user.id });

    if (res.url) {
      return NextResponse.redirect(res.url);
    }

    // Connected via Creative Kit sharing mode
    return NextResponse.redirect(
      new URL("/connected-accounts?success=snapchat_connected", request.url)
    );
  } catch (error: any) {
    return NextResponse.redirect(
      new URL(
        `/connected-accounts?error=${encodeURIComponent(
          error?.message || "Snapchat connection failed"
        )}`,
        request.url
      )
    );
  }
}

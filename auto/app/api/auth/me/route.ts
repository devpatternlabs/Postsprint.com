import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        return NextResponse.json({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.user_metadata?.name || user.email?.split("@")[0] || "Creator",
            timezone: "UTC",
          },
        });
      }
    } catch {
      // Fallback
    }

    const appUser = getSession();
    if (appUser) {
      return NextResponse.json({
        user: {
          id: appUser.id,
          email: appUser.email,
          displayName: appUser.name,
          timezone: "UTC",
          profileImage: appUser.profileImage,
        },
      });
    }

    return NextResponse.json({ user: null }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

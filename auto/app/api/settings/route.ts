import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    try {
      const adminSupabase = createAdminClient();
      const { data: profile, error } = await adminSupabase
        .from("profiles")
        .select("id, email, display_name, timezone")
        .eq("id", user.id)
        .maybeSingle();

      if (!error && profile) {
        return NextResponse.json(
          {
            profile: {
              ...profile,
              email: profile.email || user.email,
              display_name: profile.display_name || user.name,
            },
          },
          { headers }
        );
      }
    } catch {
      // Supabase query error
    }

    return NextResponse.json(
      {
        profile: {
          id: user.id,
          email: user.email,
          display_name: user.name,
          timezone: "UTC",
        },
      },
      { headers }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal error" },
      { status: 500, headers }
    );
  }
}

export async function POST(request: NextRequest) {
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    const { displayName, timezone } = await request.json();

    try {
      const adminSupabase = createAdminClient();
      const { data: updated, error } = await adminSupabase
        .from("profiles")
        .update({
          display_name: displayName,
          timezone: timezone || "UTC",
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .maybeSingle();

      if (!error && updated) {
        return NextResponse.json({ success: true, profile: updated }, { headers });
      }
    } catch {
      // Supabase error
    }

    return NextResponse.json(
      {
        success: true,
        profile: {
          id: user.id,
          email: user.email,
          display_name: displayName || user.name,
          timezone: timezone || "UTC",
        },
      },
      { headers }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update settings" },
      { status: 500, headers }
    );
  }
}

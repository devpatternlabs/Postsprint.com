import { NextRequest, NextResponse } from "next/server";
import { authenticateWithPassword } from "@/lib/auth/password";
import { setSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // 1. Try local/encrypted store first
    const result = await authenticateWithPassword({ email, password });
    if (result.user) {
      setSession(result.user);
      return NextResponse.json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          profileImage: result.user.profileImage,
        },
      });
    }

    // 2. Try Supabase Auth as secondary/fallback if configured
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data?.user) {
        setSession({
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.user_metadata?.full_name || email.split("@")[0],
          profileImage: data.user.user_metadata?.avatar_url || null,
          googleId: "",
          createdAt: data.user.created_at,
        });

        return NextResponse.json({
          success: true,
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || email.split("@")[0],
          },
        });
      }
    } catch {
      // Supabase not available
    }

    return NextResponse.json(
      { error: result.error || "Invalid email or password." },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

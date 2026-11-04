import { NextRequest, NextResponse } from "next/server";
import { registerWithPassword } from "@/lib/auth/password";
import { setSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const result = await registerWithPassword({ name: name || "", email, password });
    if (result.error || !result.user) {
      return NextResponse.json(
        { error: result.error || "Registration failed." },
        { status: 400 }
      );
    }

    // Optionally mirror to Supabase if reachable
    try {
      const supabase = createClient();
      await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
    } catch {
      // Non-blocking
    }

    // Set authenticated session cookie
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
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

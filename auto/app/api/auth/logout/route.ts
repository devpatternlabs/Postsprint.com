import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearSession } from "@/lib/auth/session";

export async function POST() {
  try {
    const supabase = createClient();
    await supabase.auth.signOut().catch(() => {});
  } catch {
    // Supabase optional
  }

  clearSession();

  const response = NextResponse.json({ success: true });
  response.cookies.set("socialauto_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  response.cookies.delete("socialauto_session");

  return response;
}

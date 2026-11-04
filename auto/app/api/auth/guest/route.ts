import { NextRequest, NextResponse } from "next/server";
import { setSession } from "@/lib/auth/session";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  appUrl = appUrl.replace(/\/+$/, "");

  // Generate unique, isolated guest session
  const randomSuffix = crypto.randomBytes(6).toString("hex");
  const guestId = `guest_${randomSuffix}`;

  setSession({
    id: guestId,
    email: `guest_${randomSuffix}@guest.local`,
    name: `Guest User ${randomSuffix.slice(0, 4)}`,
    profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${guestId}`,
    googleId: guestId,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.redirect(new URL("/dashboard", appUrl));
}

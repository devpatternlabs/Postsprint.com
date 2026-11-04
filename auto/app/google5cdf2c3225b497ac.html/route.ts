import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("google-site-verification: google5cdf2c3225b497ac.html", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

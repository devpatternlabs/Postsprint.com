import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const storagePath = searchParams.get("path");

    if (!storagePath) {
      return NextResponse.json(
        { error: "Missing required 'path' query parameter" },
        { status: 400 }
      );
    }

    // Sanitize path to prevent directory traversal
    const safePath = storagePath.replace(/\.\./g, "").replace(/^\/+/, "");

    // Verify storage path belongs strictly to the authenticated user
    if (!safePath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Forbidden: Cannot upload to another user's storage path" },
        { status: 403 }
      );
    }

    const baseDir = path.join(process.cwd(), ".data", "uploads");
    const targetFile = path.join(baseDir, safePath);

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });

    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(targetFile, buffer);

    console.log(
      `[Binary Upload] Successfully saved temporary video binary to: ${targetFile} (${buffer.length} bytes)`
    );

    return NextResponse.json({
      success: true,
      storagePath: safePath,
      size: buffer.length,
    });
  } catch (error: any) {
    console.error("[Binary Upload Error]:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save uploaded binary video." },
      { status: 500 }
    );
  }
}

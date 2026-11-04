import { getAuthUser } from "@/lib/oauth/youtube-service";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { cookies } from "next/headers";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
];

export async function POST(request: NextRequest) {
  try {
    const { getAuthenticatedUser } = await import("@/lib/auth/session");
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limiting: 30 upload signs per minute
    const rateLimit = checkRateLimit(`upload-sign:${user.id}`, 30, 60000);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait a minute." },
        { status: 429 }
      );
    }

    const { filename, fileSize, mimeType } = await request.json();

    if (!filename || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: "Missing required file metadata" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${mimeType}. Please upload an MP4, MOV, or WebM video.`,
        },
        { status: 400 }
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds the 500 MB limit." },
        { status: 400 }
      );
    }

    // Create unique post & file path
    const postId = crypto.randomUUID();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${postId}/${safeFilename}`;

    try {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("social-videos")
        .createSignedUploadUrl(storagePath);

      if (!error && data?.signedUrl) {
        return NextResponse.json({
          storagePath,
          postId,
          uploadUrl: data.signedUrl,
          token: data.token,
        });
      }
    } catch {
      // Fall through to mock upload
    }

    // Local storage endpoint for direct binary streaming
    const localUploadUrl = `/api/upload/binary?path=${encodeURIComponent(storagePath)}`;

    return NextResponse.json({
      storagePath,
      postId,
      uploadUrl: localUploadUrl,
      localUpload: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to create signed upload URL" },
      { status: 500 }
    );
  }
}

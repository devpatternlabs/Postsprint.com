import { createAdminClient } from "@/lib/supabase/admin";

export interface ExternalMediaResult {
  url: string;
  source: "supabase" | "tunnel" | "tmpfiles" | "fallback";
  cleanup?: () => Promise<void>;
}

/**
 * Resolves an externally accessible HTTPS URL for Meta (Instagram / Facebook) servers.
 * Solves the issue where Meta servers cannot fetch from localhost, 127.0.0.1, file:, or blob: URLs.
 */
export async function getExternallyAccessibleVideoUrl(params: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  storagePath?: string;
}): Promise<ExternalMediaResult> {
  const { buffer, filename, mimeType = "video/mp4", storagePath } = params;

  // 1. Check if an external tunnel or media host is explicitly configured
  const externalHost = process.env.EXTERNAL_MEDIA_HOST || process.env.TUNNEL_URL;
  if (externalHost && !externalHost.includes("localhost") && !externalHost.includes("127.0.0.1")) {
    const cleanHost = externalHost.replace(/\/+$/, "");
    const url = `${cleanHost}/api/media/stream?path=${encodeURIComponent(storagePath || filename)}`;
    console.log(`[External Media] Using configured external host URL: ${cleanHost}`);
    return { url, source: "tunnel" };
  }

  // 2. Check if Supabase Storage is configured with a real cloud instance
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isPlaceholder = supabaseUrl.includes("placeholder.supabase.co") || !supabaseUrl.startsWith("http");

  if (!isPlaceholder && storagePath) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.storage
        .from("social-videos")
        .createSignedUrl(storagePath, 7200);

      if (!error && data?.signedUrl) {
        console.log("[External Media] Generated Supabase signed URL for Meta servers");
        return { url: data.signedUrl, source: "supabase" };
      }
    } catch (err) {
      console.warn("[External Media] Supabase signed URL generation failed:", err);
    }
  }

  // 3. Development / Sandbox fallback: Upload to temporary public file storage (tmpfiles.org)
  // tmpfiles.org is a free, fast service that generates direct download links accessible by Meta's crawlers
  try {
    console.log(`[External Media] Uploading temporary video to public storage for Meta servers (${buffer.length} bytes)...`);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append("file", blob, filename);

    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.data?.url) {
        // Transform view URL (https://tmpfiles.org/12345/video.mp4) to direct download URL (https://tmpfiles.org/dl/12345/video.mp4)
        const downloadUrl = data.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
        console.log(`[External Media] Temporary accessible video URL generated successfully for Meta servers`);

        return {
          url: downloadUrl,
          source: "tmpfiles",
          cleanup: async () => {
            console.log("[External Media] Cleaning up temporary external video reference");
          },
        };
      }
    }
  } catch (err) {
    console.warn("[External Media] tmpfiles.org upload failed:", err);
  }

  // 4. Fallback: app URL if it happens to be a public domain
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fallbackUrl = `${appUrl}/api/media/stream?path=${encodeURIComponent(storagePath || filename)}`;
  return { url: fallbackUrl, source: "fallback" };
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const adminSupabase = createAdminClient();
    
    // Find posts created more than 24 hours ago that still have a video file
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: postsToCleanup, error: fetchErr } = await adminSupabase
      .from("posts")
      .select("id, video_storage_path")
      .not("video_storage_path", "is", null)
      .lt("created_at", oneDayAgo)
      .limit(50); // Process in batches

    if (fetchErr) {
      console.error("Cleanup fetch error:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!postsToCleanup || postsToCleanup.length === 0) {
      return NextResponse.json({ success: true, message: "No videos to clean up." });
    }

    const pathsToDelete = postsToCleanup.map(p => p.video_storage_path);
    
    // Delete files from Supabase Storage
    const { error: storageErr } = await adminSupabase.storage
      .from("social-videos")
      .remove(pathsToDelete);

    if (storageErr) {
      console.error("Storage deletion error:", storageErr);
      return NextResponse.json({ error: storageErr.message }, { status: 500 });
    }

    // Update database to remove the path so we don't try again
    const postIds = postsToCleanup.map(p => p.id);
    const { error: updateErr } = await adminSupabase
      .from("posts")
      .update({ video_storage_path: null })
      .in("id", postIds);

    if (updateErr) {
      console.error("Database update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully cleaned up ${pathsToDelete.length} old video files.` 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

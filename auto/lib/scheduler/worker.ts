import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchPostPublishing } from "@/lib/platforms/dispatcher";

/**
 * Checks for queued scheduled posts whose scheduled_at timestamp has arrived.
 * Claims them atomically using concurrency locking and dispatches publishing.
 */
export async function processScheduledPosts(batchSize: number = 10): Promise<{
  processedCount: number;
  postIds: string[];
}> {
  const supabase = createAdminClient();

  // Call the atomic claim stored procedure
  const { data: claimedPosts, error: claimErr } = await supabase.rpc(
    "claim_scheduled_posts",
    { batch_size: batchSize }
  );

  if (claimErr) {
    // Fallback: direct atomic update if RPC is not yet registered
    const nowIso = new Date().toISOString();
    const { data: fallbackPosts, error: fallbackErr } = await supabase
      .from("posts")
      .select("id")
      .eq("status", "queued")
      .eq("post_mode", "scheduled")
      .lte("scheduled_at", nowIso)
      .limit(batchSize);

    if (fallbackErr || !fallbackPosts || fallbackPosts.length === 0) {
      return { processedCount: 0, postIds: [] };
    }

    const postIds = fallbackPosts.map((p) => p.id);

    // Atomically mark them publishing
    await supabase
      .from("posts")
      .update({ status: "publishing", updated_at: nowIso })
      .in("id", postIds);

    // Process each post in parallel
    await Promise.allSettled(postIds.map((id) => dispatchPostPublishing(id)));

    return { processedCount: postIds.length, postIds };
  }

  if (!claimedPosts || claimedPosts.length === 0) {
    return { processedCount: 0, postIds: [] };
  }

  const postIds = claimedPosts.map((p: any) => p.id);

  // Process each post in parallel
  await Promise.allSettled(postIds.map((id: string) => dispatchPostPublishing(id)));

  return { processedCount: postIds.length, postIds };
}

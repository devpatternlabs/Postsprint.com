// api/cron/publish.js
// Postmint Background Server-Side Cron Worker
// Executed by Vercel Cron or external triggers to publish due scheduled posts
// Operates fully server-side even when browser is closed or machine is powered off

const db = require('../../lib/db');
const publisher = require('../../lib/publisher');
const supabaseStorage = require('../../lib/supabase-storage');

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Authorization check (optional: verify CRON_SECRET if configured)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.query.secret !== process.env.CRON_SECRET) {
      console.warn('[Cron Auth] Unauthorized cron trigger attempt');
      return res.status(401).json({ success: false, error: 'Unauthorized cron trigger' });
    }
  }

  const startTime = Date.now();
  console.log('[Cron Worker] Checking for due scheduled posts...');

  try {
    const duePosts = await db.getDueScheduledPosts();
    console.log(`[Cron Worker] Found ${duePosts.length} due scheduled post(s).`);

    if (duePosts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No due scheduled posts to process.',
        processed: 0,
        elapsedMs: Date.now() - startTime
      });
    }

    const executionResults = [];

    for (const post of duePosts) {
      // 1. Concurrency-safe atomic claim
      const claimed = await db.claimPostForPublishing(post.id);
      if (!claimed) {
        console.log(`[Cron Worker] Post ${post.id} already claimed by another worker, skipping.`);
        continue;
      }

      console.log(`[Cron Worker] Claimed and processing post "${post.title || post.caption.slice(0, 30)}" (${post.id})...`);

      // 2. Determine target platforms (exclude already published platforms)
      const targetsToPublish = (post.targets && post.targets.length > 0)
        ? post.targets.filter(t => t.status !== 'published')
        : (post.platforms || ['Facebook']).map(p => ({ platform: p.toLowerCase() }));

      const platformNames = targetsToPublish.map(t => {
        const name = t.platform || 'facebook';
        return name.charAt(0).toUpperCase() + name.slice(1);
      });

      if (platformNames.length === 0) {
        await db.finalizePostStatus(post.id, { results: [] });
        continue;
      }

      let pubResult = { success: false, results: [] };
      let postError = '';

      try {
        pubResult = await publisher.publishToAllPlatforms({
          postId: post.id,
          platforms: platformNames,
          title: post.title || post.caption.slice(0, 60),
          caption: post.caption,
          hashtags: post.hashtags || '',
          type: post.type || 'Post',
          ratio: post.ratio || '1:1',
          storagePath: post.storagePath,
          mediaUrl: post.mediaUrl,
          userId: post.userId || 'usr_default_postmint'
        });
      } catch (pubErr) {
        console.error(`[Cron Worker] Publishing exception for post ${post.id}:`, pubErr.message);
        postError = pubErr.message;
        pubResult = {
          success: false,
          results: platformNames.map(p => ({ platform: p, success: false, error: pubErr.message }))
        };
      }

      // 3. Update target statuses
      for (const r of (pubResult.results || [])) {
        const matchTarget = (post.targets || []).find(t => (t.platform || '').toLowerCase() === (r.platform || '').toLowerCase());
        if (matchTarget) {
          await db.updatePostTarget(matchTarget.id, {
            status: r.success ? 'published' : 'failed',
            platform_post_id: r.postId || null,
            platform_url: r.url || null,
            error_message: r.error || null,
            published_at: r.success ? new Date().toISOString() : null,
            attempt_count: (matchTarget.attempt_count || 0) + 1
          });
        }
      }

      // 4. Finalize post status
      const finalized = await db.finalizePostStatus(post.id, {
        results: pubResult.results,
        error: postError || pubResult.results.filter(r => !r.success).map(r => `${r.platform}: ${r.error}`).join('; ')
      });

      // 5. Automatic Supabase Storage Cleanup only when ALL platforms succeed
      const allTargetSuccess = pubResult.results.length > 0 && pubResult.results.every(r => r.success);
      if (allTargetSuccess && post.storagePath) {
        try {
          await supabaseStorage.deleteFromSupabase(post.storagePath);
          console.log(`[Cron Worker] Cleaned storage path ${post.storagePath}`);
        } catch (cleanErr) {
          console.warn('[Cron Worker] Cleanup warning:', cleanErr.message);
        }
      }

      executionResults.push({
        postId: post.id,
        title: post.title,
        status: finalized.status,
        results: pubResult.results
      });
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`[Cron Worker] Processed ${executionResults.length} post(s) in ${elapsedMs}ms.`);

    return res.status(200).json({
      success: true,
      processed: executionResults.length,
      elapsedMs,
      posts: executionResults
    });
  } catch (err) {
    console.error('[Cron Worker Fatal Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      elapsedMs: Date.now() - startTime
    });
  }
}

module.exports = handler;
module.exports.default = handler;


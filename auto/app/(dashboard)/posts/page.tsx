"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Post, PostStatus } from "@/types";
import { PostStatusBadge } from "@/components/PostStatusBadge";
import { formatInTimezone } from "@/lib/utils/timezone";
import {
  Film,
  Calendar,
  ExternalLink,
  Instagram,
  Facebook,
  Youtube,
  Ghost,
  Share2,
  ArrowRight,
  Plus,
  RefreshCw,
} from "lucide-react";

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();
      if (data.posts) {
        setPosts(data.posts);
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  const [deletedMsg, setDeletedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
    
    // Check for delete success message in URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("deleted") === "true") {
        const platforms = params.get("platforms");
        if (platforms === "true") {
          setDeletedMsg("Post successfully deleted from the dashboard and social platforms!");
        } else {
          setDeletedMsg("Post successfully deleted from the dashboard.");
        }
        
        // Clean up URL without refreshing
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Hide message after 5 seconds
        setTimeout(() => setDeletedMsg(null), 5000);
      }
    }
  }, []);

  const filteredPosts = posts.filter((p) => {
    if (filter === "all") return true;
    return p.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Post History
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Monitor and track your multi-platform publications
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchPosts}
            title="Refresh list"
            className="p-2.5 rounded-xl bg-[#11131A] border border-[#1E2230] text-gray-400 hover:text-white hover:border-gray-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Post</span>
          </Link>
        </div>
      </div>

      {deletedMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm font-medium flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {deletedMsg}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[#1E2230]">
        {[
          { id: "all", label: "All Posts" },
          { id: "completed", label: "Published" },
          { id: "publishing", label: "Publishing" },
          { id: "partial", label: "Partial" },
          { id: "queued", label: "Queued / Scheduled" },
          { id: "failed", label: "Failed" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              filter === tab.id
                ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          Loading posts...
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-[#1E2230]">
          <Film className="w-12 h-12 text-gray-600 mx-auto mb-3 stroke-[1.5]" />
          <h3 className="text-base font-semibold text-white mb-1">No posts found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto mb-5">
            You haven't created any posts matching this filter yet. Upload a video to get started.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Post</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => {
            const hasInstagram = post.targets?.some((t) => t.platform === "instagram");
            const hasFacebook = post.targets?.some((t) => t.platform === "facebook");
            const hasYoutube = post.targets?.some((t) => t.platform === "youtube");
            const hasSnapchat = post.targets?.some((t) => t.platform === "snapchat");
            const hasSharechat = post.targets?.some((t) => t.platform === "sharechat");

            return (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="glass-card rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-[#1E2230] hover:border-indigo-500/40 hover:bg-gray-50/80 dark:hover:bg-[#151824] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group shadow-sm"
              >
                {/* Left info */}
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-14 h-16 rounded-xl bg-gray-100 dark:bg-[#181B26] border border-gray-200 dark:border-[#272D40] flex items-center justify-center flex-shrink-0 text-gray-500 shadow-xs">
                    <Film className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-md">
                      {post.caption}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span className="font-medium">{post.video_filename}</span>
                      <span>•</span>
                      <span>
                        {post.post_mode === "scheduled" && post.scheduled_at ? (
                          <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 inline-flex font-semibold">
                            <Calendar className="w-3 h-3" />
                            {formatInTimezone(post.scheduled_at, post.timezone)}
                          </span>
                        ) : (
                          formatInTimezone(post.created_at, post.timezone)
                        )}
                      </span>
                    </div>

                    {/* Platform badges with visible names & brand colors */}
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      {hasYoutube && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30 shadow-2xs">
                          <Youtube className="w-3 h-3 text-red-600 dark:text-red-400" />
                          <span>YouTube</span>
                        </span>
                      )}
                      {hasFacebook && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30 shadow-2xs">
                          <Facebook className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          <span>Facebook</span>
                        </span>
                      )}
                      {hasInstagram && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/30 shadow-2xs">
                          <Instagram className="w-3 h-3 text-pink-600 dark:text-pink-400" />
                          <span>Instagram</span>
                        </span>
                      )}
                      {hasSnapchat && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30 shadow-2xs">
                          <Ghost className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Snapchat</span>
                        </span>
                      )}
                      {hasSharechat && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/30 shadow-2xs">
                          <Share2 className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                          <span>ShareChat</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right status */}
                <div className="flex items-center justify-between sm:justify-end gap-4 self-stretch sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-[#1E2230]">
                  <PostStatusBadge status={post.status} />
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

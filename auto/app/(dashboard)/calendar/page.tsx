"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Post } from "@/types";
import { formatInTimezone } from "@/lib/utils/timezone";
import {
  Calendar as CalendarIcon,
  Clock,
  Film,
  Instagram,
  Facebook,
  Youtube,
  Plus,
  ArrowRight,
} from "lucide-react";

export default function CalendarPage() {
  const [scheduledPosts, setScheduledPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts?mode=scheduled")
      .then((res) => res.json())
      .then((data) => {
        if (data.posts) {
          setScheduledPosts(data.posts);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Content Calendar
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            View and manage your upcoming automated scheduled posts
          </p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule Post</span>
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-500 text-sm">
          Loading scheduled calendar...
        </div>
      ) : scheduledPosts.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border border-[#1E2230]">
          <CalendarIcon className="w-12 h-12 text-gray-600 mx-auto mb-3 stroke-[1.5]" />
          <h3 className="text-base font-semibold text-white mb-1">
            No scheduled posts
          </h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto mb-5">
            You don't have any posts queued for future publication. Pick a date & time in Create Post to schedule.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule First Video</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Upcoming Queue ({scheduledPosts.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scheduledPosts.map((post) => {
              const hasInstagram = post.targets?.some((t) => t.platform === "instagram");
              const hasFacebook = post.targets?.some((t) => t.platform === "facebook");
              const hasYoutube = post.targets?.some((t) => t.platform === "youtube");

              return (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="glass-card rounded-2xl p-5 border border-[#1E2230] hover:border-indigo-500/40 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {formatInTimezone(post.scheduled_at, post.timezone)}
                        </span>
                      </span>

                      {/* Platforms */}
                      <div className="flex items-center gap-1">
                        {hasInstagram && (
                          <Instagram className="w-3.5 h-3.5 text-pink-400" />
                        )}
                        {hasFacebook && (
                          <Facebook className="w-3.5 h-3.5 text-blue-400" />
                        )}
                        {hasYoutube && (
                          <Youtube className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-white font-medium line-clamp-2">
                      {post.caption}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-[#1E2230] flex items-center justify-between text-xs text-gray-500 group-hover:text-indigo-400 transition-colors">
                    <span className="truncate">{post.video_filename}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

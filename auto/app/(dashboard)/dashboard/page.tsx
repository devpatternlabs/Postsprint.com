"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "@/components/UploadDropzone";
import { CaptionEditor } from "@/components/CaptionEditor";
import { PlatformSelector } from "@/components/PlatformSelector";
import { SchedulePicker } from "@/components/SchedulePicker";
import { PublishButton } from "@/components/PublishButton";
import { VideoPreview } from "@/components/VideoPreview";
import { Platform, PostMode, VideoMetadata } from "@/types";
import { localToUtcIso } from "@/lib/utils/timezone";
import { AlertCircle } from "lucide-react";

export default function CreatePostPage() {
  const router = useRouter();

  // Form states
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [uploadedPostId, setUploadedPostId] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<"public" | "unlisted" | "private">("public");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "instagram",
    "facebook",
    "youtube",
  ]);

  const [postMode, setPostMode] = useState<PostMode>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [timezone, setTimezone] = useState("UTC");

  // Connected accounts status
  const [connectedMeta, setConnectedMeta] = useState(false);
  const [connectedYoutube, setConnectedYoutube] = useState(false);
  const [connectedSnapchat, setConnectedSnapchat] = useState(false);
  const [connectedShareChat, setConnectedShareChat] = useState(true);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMockMode = process.env.NEXT_PUBLIC_SOCIAL_API_MOCK_MODE === "true";

  // Detect user timezone and load account connections
  useEffect(() => {
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (userTz) setTimezone(userTz);
    } catch {
      // Fallback
    }

    // Set tomorrow's date by default for schedule
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduledDate(tomorrow.toISOString().split("T")[0]);

    // Fetch accounts
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => {
        if (data.accounts) {
          const hasMeta = data.accounts.some((a: any) => a.provider === "meta");
          const hasYt = data.accounts.some((a: any) => a.provider === "youtube");
          const hasSnap = data.accounts.some((a: any) => a.provider === "snapchat");
          const hasShare = data.accounts.some((a: any) => a.provider === "sharechat");
          setConnectedMeta(hasMeta);
          setConnectedYoutube(hasYt);
          setConnectedSnapchat(hasSnap);
          setConnectedShareChat(true); // Always ready for manual sharing
        }
      })
      .catch(() => {});
  }, []);

  // Direct-to-storage upload handler
  const handleStartUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      // 1. Get signed upload URL
      const signRes = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      const signData = await signRes.json();
      if (!signRes.ok) {
        throw new Error(signData.error || "Failed to initialize upload.");
      }

      setStoragePath(signData.storagePath);
      setUploadedPostId(signData.postId);
      setUploadProgress(40);

      // 2. Perform direct upload to signed storage URL if provided
      if (signData.uploadUrl) {
        const uploadRes = await fetch(signData.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error("Direct storage upload failed.");
        }
      } else {
        // Mock upload progress simulation
        await new Promise((r) => setTimeout(r, 600));
      }

      setUploadProgress(100);
    } catch (err: any) {
      setError(err?.message || "Error uploading video file");
      setMetadata(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Submit form
  const handlePublish = async () => {
    if (isSubmitting || isUploading) return;

    if (!metadata || !storagePath) {
      setError("Please upload a video first.");
      return;
    }

    if (!caption.trim()) {
      setError("Please enter a caption for your post.");
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform to publish to.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let scheduledAtIso: string | null = null;
      if (postMode === "scheduled") {
        scheduledAtIso = localToUtcIso(scheduledDate, scheduledTime, timezone);
        if (new Date(scheduledAtIso).getTime() <= Date.now()) {
          throw new Error("Scheduled time must be in the future.");
        }
      }

      const payload = {
        postId: uploadedPostId,
        videoStoragePath: storagePath,
        videoFilename: metadata.filename,
        videoSize: metadata.size,
        videoDuration: metadata.duration,
        videoWidth: metadata.width,
        videoHeight: metadata.height,
        mimeType: metadata.mimeType,
        caption,
        youtubeTitle: youtubeTitle.trim() || null,
        privacyStatus,
        platforms: selectedPlatforms,
        postMode,
        scheduledAt: scheduledAtIso,
        timezone,
      };

      const res = await fetch("/api/posts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create post.");
      }

      // Navigate to status screen for this post
      router.push(`/posts/${data.postId}`);
    } catch (err: any) {
      setError(err?.message || "Failed to submit post.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div>
        <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
          Create Post
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Upload Once. Go Everywhere.
        </h1>
        <p className="text-sm sm:text-base text-gray-400 mt-1">
          Post to YouTube, Facebook, Instagram, Snapchat and ShareChat — all from one place.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Form on Left, Phone Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form Area (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Video Upload */}
          <div className="glass-card rounded-2xl p-5 border border-[#1E2230]">
            <UploadDropzone
              metadata={metadata}
              onMetadataChange={setMetadata}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              onStartUpload={handleStartUpload}
            />
          </div>

          {/* Step 2: Caption */}
          <div className="glass-card rounded-2xl p-5 border border-[#1E2230]">
            <CaptionEditor
              caption={caption}
              onCaptionChange={setCaption}
              youtubeTitle={youtubeTitle}
              onYoutubeTitleChange={setYoutubeTitle}
              isYouTubeSelected={selectedPlatforms.includes("youtube")}
              privacyStatus={privacyStatus}
              onPrivacyStatusChange={setPrivacyStatus}
              videoFile={metadata?.file || null}
              videoMetadata={metadata}
              selectedPlatforms={selectedPlatforms}
            />
          </div>

          {/* Step 3: Platform Selection */}
          <div className="glass-card rounded-2xl p-5 border border-[#1E2230]">
            <PlatformSelector
              selectedPlatforms={selectedPlatforms}
              onChange={setSelectedPlatforms}
              connectedMeta={connectedMeta}
              connectedYoutube={connectedYoutube}
              connectedSnapchat={connectedSnapchat}
              connectedShareChat={connectedShareChat}
              isMockMode={isMockMode}
            />
          </div>

          {/* Step 4: When to Post */}
          <div className="glass-card rounded-2xl p-5 border border-[#1E2230]">
            <SchedulePicker
              postMode={postMode}
              onPostModeChange={setPostMode}
              scheduledDate={scheduledDate}
              onDateChange={setScheduledDate}
              scheduledTime={scheduledTime}
              onTimeChange={setScheduledTime}
              timezone={timezone}
              onTimezoneChange={setTimezone}
            />
          </div>

          {/* Step 5: Publish Action Button */}
          <PublishButton
            postMode={postMode}
            isSubmitting={isSubmitting}
            isUploading={isUploading}
            disabled={!metadata || isUploading || isSubmitting || selectedPlatforms.length === 0}
            selectedPlatformCount={selectedPlatforms.length}
            onClick={handlePublish}
          />
        </div>

        {/* Right Preview Column (5 Cols) */}
        <div className="lg:col-span-5 flex justify-center sticky top-8">
          <div className="glass-card rounded-3xl p-6 border border-[#1E2230] w-full max-w-sm">
            <VideoPreview
              thumbnailUrl={metadata?.thumbnailUrl}
              caption={caption}
              selectedPlatforms={selectedPlatforms}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

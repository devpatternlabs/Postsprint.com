"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Youtube,
  CheckCircle2,
  AlertCircle,
  Upload,
  Film,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Calendar,
  Clock,
  Globe,
  Lock,
  EyeOff,
  Loader2,
  Tag,
  FileVideo,
  X,
} from "lucide-react";

interface YouTubeChannel {
  id: string;
  title: string;
  avatarUrl: string | null;
  email: string | null;
  googleUserId: string | null;
}

export default function YouTubePage() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Connection state
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [channel, setChannel] = useState<YouTubeChannel | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacyStatus, setPrivacyStatus] = useState<"public" | "unlisted" | "private">("public");

  // Scheduling state
  const [enableSchedule, setEnableSchedule] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("12:00");

  // Uploading state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    videoId: string;
    videoUrl: string;
    channelTitle: string;
    status: string;
    isProcessing?: boolean;
    message?: string;
    scheduledAt?: string | null;
  } | null>(null);

  const [devError, setDevError] = useState<{
    status?: number;
    code?: number;
    reason?: string;
    exactGoogleReason?: string;
    message?: string;
    detailMessage?: string;
    channelId?: string;
    channelName?: string;
    insertCallsCount?: number;
  } | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);

  // Fetch YouTube connection status
  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/youtube/status");
      const data = await res.json();

      if (data.connected && data.channel) {
        setConnected(true);
        setChannel(data.channel);
      } else {
        setConnected(false);
        setChannel(null);
      }

    } catch {
      setConnected(false);
      setChannel(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Default scheduled date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduledDate(tomorrow.toISOString().split("T")[0]);

    // Handle URL parameters from OAuth callback
    const successParam = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (successParam === "youtube_connected") {
      setNotification({
        type: "success",
        message: "YouTube channel successfully connected!",
      });
    } else if (errorParam) {
      setNotification({
        type: "error",
        message: decodeURIComponent(errorParam),
      });
    }
  }, [searchParams]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate video type
    if (!selectedFile.type.startsWith("video/") && !selectedFile.name.match(/\.(mp4|mov|webm|mkv|avi)$/i)) {
      setNotification({
        type: "error",
        message: "Invalid video format. Please select an MP4, MOV, WebM, or MKV file.",
      });
      return;
    }

    setFile(selectedFile);
    setUploadResult(null);

    // Auto-fill title from filename if empty
    if (!title.trim()) {
      const defaultTitle = selectedFile.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setTitle(defaultTitle);
    }

    // Generate local preview URL
    try {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(null);
    }
  };

  const removeSelectedFile = () => {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Disconnect handler
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your YouTube channel?")) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch("/api/youtube/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
        setChannel(null);
        setNotification({
          type: "success",
          message: "YouTube disconnected successfully.",
        });
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to disconnect.");
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: err?.message || "Failed to disconnect YouTube.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  // Upload handler with progress simulation
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploading) return;

    if (!connected) {
      setNotification({
        type: "error",
        message: "Please connect your YouTube channel before uploading.",
      });
      return;
    }

    if (!file) {
      setNotification({
        type: "error",
        message: "Please select a video file to upload.",
      });
      return;
    }

    if (!title.trim()) {
      setNotification({
        type: "error",
        message: "Please provide a title for your video.",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    setNotification(null);
    setUploadResult(null);
    setDevError(null);

    // Prepare FormData with actual binary video file
    const formData = new FormData();
    formData.append("video", file);
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("tags", tags.trim());
    formData.append("privacyStatus", privacyStatus);

    if (enableSchedule && scheduledDate && scheduledTime) {
      const scheduledIso = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
      if (new Date(scheduledIso).getTime() <= Date.now()) {
        setNotification({
          type: "error",
          message: "Scheduled time must be in the future.",
        });
        setUploading(false);
        return;
      }
      formData.append("scheduledAt", scheduledIso);
    }

    // Animate progress indicator
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 88) {
          clearInterval(progressInterval);
          return 88;
        }
        return prev + Math.floor(Math.random() * 12) + 5;
      });
    }, 300);

    try {
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();

      if (!res.ok || !data.videoId || typeof data.videoId !== "string" || data.videoId.startsWith("mock_")) {
        const errorMsg =
          data.error || "Upload failed: YouTube Data API v3 did not return a valid video ID.";
        if (data.devDetails) {
          setDevError(data.devDetails);
        } else {
          setDevError({
            status: res.status,
            reason: "INVALID_YOUTUBE_VIDEO_ID",
            message: errorMsg,
          });
        }
        throw new Error(errorMsg);
      }

      // Build real YouTube watch URL strictly from response.data.id
      const realVideoUrl = `https://www.youtube.com/watch?v=${data.videoId}`;

      setUploadResult({
        videoId: data.videoId,
        videoUrl: realVideoUrl,
        channelTitle: data.channelTitle || channel?.title || "Connected Channel",
        status: data.status,
        isProcessing: data.isProcessing,
        message: data.message,
        scheduledAt: data.scheduledAt,
      });

      if (data.isProcessing) {
        setNotification({
          type: "success",
          message: "Uploaded successfully — YouTube is processing the video.",
        });
      } else {
        setNotification({
          type: "success",
          message: "Video published successfully to YouTube!",
        });
      }

      // Clear file after successful upload
      removeSelectedFile();
    } catch (err: any) {
      console.error("[YouTube Upload Client Error]:", err);
      setNotification({
        type: "error",
        message: err?.message || "An error occurred during video upload.",
      });
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
    }
  };

  const copyVideoUrl = () => {
    if (uploadResult?.videoUrl) {
      navigator.clipboard.writeText(uploadResult.videoUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Youtube className="w-3.5 h-3.5" />
            <span>YouTube Hub</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            YouTube Connection & Upload
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Connect via Google OAuth and publish videos directly to your YouTube channel.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStatus}
          disabled={loadingStatus}
          title="Refresh connection status"
          className="p-2.5 rounded-xl bg-[#11131A] border border-[#1E2230] text-gray-400 hover:text-white transition-colors self-start sm:self-center"
        >
          <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin text-indigo-400" : ""}`} />
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in duration-200 ${
            notification.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-white ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Development Error Panel */}
      {devError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-red-400 font-bold">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>Google API Error Details (Development Diagnostics)</span>
            </span>
            <button
              onClick={() => setDevError(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="bg-[#0B0D14] p-3 rounded-lg font-mono text-[11px] space-y-1.5 text-gray-300 border border-[#272D40]">
            <div>
              <span className="text-gray-500">HTTP Status: </span>
              <span className="text-red-300 font-bold">{devError.status || "N/A"}</span>
            </div>
            {devError.code && (
              <div>
                <span className="text-gray-500">Error Code: </span>
                <span className="text-red-300 font-bold">{devError.code}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">Google API Reason: </span>
              <span className="text-amber-400 font-semibold">{devError.exactGoogleReason || devError.reason || "N/A"}</span>
            </div>
            <div>
              <span className="text-gray-500">API Message: </span>
              <span className="text-white">{devError.message || "No detailed message"}</span>
            </div>
            {devError.detailMessage && devError.detailMessage !== devError.message && (
              <div>
                <span className="text-gray-500">Detail Message: </span>
                <span className="text-gray-300">{devError.detailMessage}</span>
              </div>
            )}
            {devError.channelId && (
              <div>
                <span className="text-gray-500">Connected Channel ID: </span>
                <span className="text-indigo-300">{devError.channelId}</span>
              </div>
            )}
            {devError.channelName && (
              <div>
                <span className="text-gray-500">Connected Channel Name: </span>
                <span className="text-indigo-300">{devError.channelName}</span>
              </div>
            )}
            {devError.insertCallsCount !== undefined && (
              <div>
                <span className="text-gray-500">videos.insert Call Count: </span>
                <span className="text-emerald-400 font-bold">{devError.insertCallsCount} (exact single call)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: YouTube Connection Status Card */}
      {/* ========================================================================= */}
      <div className="glass-card rounded-2xl p-6 border border-[#1E2230] shadow-xl space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-500 shadow-md">
              <Youtube className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>YouTube</span>
                {connected && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Connected
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-400">
                Official YouTube Data API v3 (Direct Video Uploads)
              </p>
            </div>
          </div>
        </div>

        {loadingStatus ? (
          <div className="py-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
            <span>Checking YouTube connection...</span>
          </div>
        ) : connected && channel ? (
          /* CONNECTED STATE */
          <div className="p-5 rounded-xl bg-[#141724] border border-[#272D40] space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                {channel.avatarUrl ? (
                  <img
                    src={channel.avatarUrl}
                    alt={channel.title}
                    className="w-12 h-12 rounded-full border-2 border-red-500/40 object-cover shadow"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-sm font-bold text-red-400">
                    {channel.title.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white">{channel.title}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  {channel.email && (
                    <span className="text-xs text-gray-400 block mt-0.5 font-mono">
                      Google Account: <strong className="text-gray-300 font-normal">{channel.email}</strong>
                    </span>
                  )}
                  <span className="text-[11px] text-gray-500 block">
                    Channel ID: {channel.id}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-xs font-semibold text-red-400 transition-colors self-start sm:self-center"
              >
                {disconnecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        ) : (
          /* NOT CONNECTED STATE */
          <div className="p-6 rounded-xl bg-gradient-to-b from-[#141724] to-[#10121D] border border-red-500/20 text-center space-y-4 animate-in fade-in duration-200">
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-white">
                Connect your YouTube Channel
              </h3>
              <p className="text-xs text-gray-400">
                Click below to sign in with Google and authorize video uploads to your channel.
                No manual API keys or configuration needed.
              </p>
            </div>

            <div>
              <a
                href="/api/auth/youtube"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <Youtube className="w-4 h-4 fill-white" />
                <span>Connect YouTube</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: Video Upload Section */}
      {/* ========================================================================= */}
      <div className="glass-card rounded-2xl p-6 border border-[#1E2230] shadow-xl space-y-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-red-500" />
            <span>Upload to YouTube</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Select a video file, configure your title, description, tags, and privacy.
          </p>
        </div>

        {/* Upload Success Banner */}
        {uploadResult && (
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base sm:text-lg">
                <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                <span>✅ Published to YouTube</span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                  uploadResult.isProcessing
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                {uploadResult.status}
              </span>
            </div>

            {uploadResult.isProcessing && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-amber-400" />
                <span>Uploaded successfully — YouTube is processing the video.</span>
              </div>
            )}

            <div className="bg-[#0D0F17] p-4 rounded-xl border border-[#1E2230] space-y-2.5 text-xs sm:text-sm">
              <div className="flex items-center justify-between py-1 border-b border-[#1E2230]/50">
                <span className="text-gray-400 font-medium">Channel:</span>
                <span className="font-bold text-white">
                  {uploadResult.channelTitle}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#1E2230]/50">
                <span className="text-gray-400 font-medium">Video ID:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {uploadResult.videoId}
                </span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-gray-400 font-medium">Open Video:</span>
                <div className="flex items-center gap-2">
                  <a
                    href={uploadResult.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-red-400 hover:underline font-mono text-xs truncate max-w-[200px] sm:max-w-xs"
                  >
                    https://www.youtube.com/watch?v={uploadResult.videoId}
                  </a>
                  <button
                    type="button"
                    onClick={copyVideoUrl}
                    className="p-1 text-gray-400 hover:text-white"
                    title="Copy URL"
                  >
                    {copiedUrl ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {privacyStatus === "private" && (
              <p className="text-[11px] text-gray-400 italic">
                * Note: Video privacy is set to <strong>Private</strong>. Only accounts authorized to access the channel (<strong>{uploadResult.channelTitle}</strong>) can view it on YouTube.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href={uploadResult.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Video on YouTube</span>
              </a>
              <button
                type="button"
                onClick={() => setUploadResult(null)}
                className="px-4 py-2.5 rounded-xl bg-[#181B26] hover:bg-[#222738] border border-[#272D40] text-xs font-medium text-gray-300 hover:text-white transition-colors"
              >
                Upload Another Video
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-5">
          {/* File Picker */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-2">
              Video File
            </label>

            {!file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#272D40] hover:border-red-500/50 hover:bg-[#141724]/60 rounded-2xl p-8 text-center cursor-pointer transition-all group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,.mp4,.mov,.webm,.mkv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-[#181B26] group-hover:bg-red-600/20 border border-[#272D40] group-hover:border-red-500/40 flex items-center justify-center text-gray-400 group-hover:text-red-400 mx-auto mb-3 transition-colors">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-white group-hover:text-red-400 transition-colors">
                  Click to choose video or drag and drop
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  MP4, MOV, WebM or MKV • Max 500 MB
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#141724] border border-[#272D40] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 flex-shrink-0">
                    <FileVideo className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || "video"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-[#181B26] hover:bg-[#222738] border border-[#272D40] text-xs font-medium text-gray-300 hover:text-white"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedFile}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.mkv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Video Preview (if available) */}
          {previewUrl && (
            <div className="rounded-xl overflow-hidden border border-[#272D40] bg-black max-w-sm mx-auto">
              <video
                src={previewUrl}
                controls
                className="w-full max-h-56 object-contain"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. My Amazing Video | Full Tutorial"
              className="w-full px-4 py-2.5 bg-[#0D0F17] border border-[#272D40] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <span className="text-[10px] text-gray-500 block text-right mt-1">
              {title.length}/100 characters
            </span>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              Description
            </label>
            <textarea
              rows={4}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell viewers what your video is about, links, and hashtags..."
              className="w-full px-4 py-2.5 bg-[#0D0F17] border border-[#272D40] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors resize-y"
            />
            <span className="text-[10px] text-gray-500 block text-right mt-1">
              {description.length}/5000 characters
            </span>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              <span>Tags</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. tutorial, automation, viral, tech (comma-separated)"
              className="w-full px-4 py-2.5 bg-[#0D0F17] border border-[#272D40] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <span className="text-[10px] text-gray-500 block mt-1">
              Separate tags with commas. Max 50 tags.
            </span>
          </div>

          {/* Privacy Status & Scheduling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-gray-400" />
                <span>Privacy Status</span>
              </label>
              <select
                value={privacyStatus}
                onChange={(e) => setPrivacyStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[#0D0F17] border border-[#272D40] rounded-xl text-xs text-white focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
              >
                <option value="public">Public (Everyone can see)</option>
                <option value="unlisted">Unlisted (Anyone with link can see)</option>
                <option value="private">Private (Only you can see)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>Publish Schedule (Optional)</span>
              </label>
              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  id="scheduleToggle"
                  checked={enableSchedule}
                  onChange={(e) => setEnableSchedule(e.target.checked)}
                  className="rounded bg-[#0D0F17] border-[#272D40] text-red-600 focus:ring-red-500 h-4 w-4"
                />
                <label htmlFor="scheduleToggle" className="text-xs text-gray-300 cursor-pointer">
                  Schedule for a future date & time
                </label>
              </div>
            </div>
          </div>

          {/* Scheduling inputs */}
          {enableSchedule && (
            <div className="p-4 rounded-xl bg-[#141724] border border-[#272D40] grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-200">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0D0F17] border border-[#272D40] rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0D0F17] border border-[#272D40] rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <p className="text-[10px] text-gray-400 sm:col-span-2">
                Note: YouTube sets scheduled videos to Private until the specified publish time.
              </p>
            </div>
          )}

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-2 p-4 rounded-xl bg-red-500/10 border border-red-500/25 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-semibold text-white">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                  <span>Uploading to YouTube...</span>
                </span>
                <span className="text-red-400 font-mono">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[#141724] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-red-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={uploading || !connected || !file || !title.trim()}
              className="w-full py-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-red-600/25 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading to YouTube...</span>
                </>
              ) : (
                <>
                  <Youtube className="w-4 h-4" />
                  <span>Publish to YouTube</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

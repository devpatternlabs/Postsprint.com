import { Platform } from "@/types";

export interface PlatformLimits {
  name: string;
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
  maxDurationSeconds: number;
  minDurationSeconds: number;
  maxCaptionLength: number;
  aspectRatioRecommendation: string;
  notes: string;
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformLimits> = {
  instagram: {
    name: "Instagram",
    allowedMimeTypes: ["video/mp4", "video/quicktime"],
    maxFileSizeBytes: 1024 * 1024 * 1024, // 1 GB
    maxDurationSeconds: 900, // Up to 15 minutes (Reels up to 90s are promoted in Reels feed)
    minDurationSeconds: 3,
    maxCaptionLength: 2200,
    aspectRatioRecommendation: "9:16 (vertical) recommended; 4:5 to 16:9 supported",
    notes: "Requires an Instagram Business or Creator account connected to a Facebook Page.",
  },
  facebook: {
    name: "Facebook",
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/x-m4v"],
    maxFileSizeBytes: 4 * 1024 * 1024 * 1024, // 4 GB standard API
    maxDurationSeconds: 14400, // 240 minutes
    minDurationSeconds: 1,
    maxCaptionLength: 5000,
    aspectRatioRecommendation: "9:16, 1:1, or 16:9 supported",
    notes: "Publishes to your connected Facebook Business Page.",
  },
  youtube: {
    name: "YouTube",
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
    maxFileSizeBytes: 10 * 1024 * 1024 * 1024, // 10 GB (API safe chunking limit)
    maxDurationSeconds: 43200, // 12 hours
    minDurationSeconds: 1,
    maxCaptionLength: 5000,
    aspectRatioRecommendation: "16:9 (horizontal) or 9:16 (vertical for Shorts)",
    notes: "Vertical videos <= 60 seconds are automatically treated as YouTube Shorts.",
  },
  snapchat: {
    name: "Snapchat",
    allowedMimeTypes: ["video/mp4", "video/quicktime"],
    maxFileSizeBytes: 500 * 1024 * 1024, // 500 MB
    maxDurationSeconds: 60, // Standard 60s for Spotlight and Story snaps
    minDurationSeconds: 3,
    maxCaptionLength: 250,
    aspectRatioRecommendation: "9:16 (vertical, 1080x1920) recommended",
    notes: "Supports official Snapchat publishing via partner API or Creative Kit sharing.",
  },
  sharechat: {
    name: "ShareChat",
    allowedMimeTypes: ["video/mp4", "video/quicktime"],
    maxFileSizeBytes: 200 * 1024 * 1024, // 200 MB
    maxDurationSeconds: 300, // 5 minutes
    minDurationSeconds: 2,
    maxCaptionLength: 1000,
    aspectRatioRecommendation: "9:16 (vertical) or 1:1 supported",
    notes: "Automatic publishing via partner API or guided manual share flow.",
  },
};

export interface ValidationIssue {
  platform: Platform;
  field: "mimeType" | "fileSize" | "duration" | "caption";
  message: string;
}

/**
 * Validates a video and caption against platform limits.
 */
export function validateForPlatform(
  platform: Platform,
  metadata: {
    size: number;
    duration?: number;
    mimeType: string;
    caption: string;
  }
): ValidationIssue[] {
  const config = PLATFORM_CONFIGS[platform];
  const issues: ValidationIssue[] = [];

  // MIME check
  if (!config.allowedMimeTypes.includes(metadata.mimeType.toLowerCase())) {
    issues.push({
      platform,
      field: "mimeType",
      message: `${config.name} does not support ${metadata.mimeType}. Supported formats: ${config.allowedMimeTypes.join(", ")}`,
    });
  }

  // File size check
  if (metadata.size > config.maxFileSizeBytes) {
    const maxMb = Math.round(config.maxFileSizeBytes / (1024 * 1024));
    issues.push({
      platform,
      field: "fileSize",
      message: `Video size exceeds ${config.name}'s limit of ${maxMb} MB.`,
    });
  }

  // Duration check
  if (metadata.duration !== undefined && metadata.duration > 0) {
    if (metadata.duration < config.minDurationSeconds) {
      issues.push({
        platform,
        field: "duration",
        message: `Video must be at least ${config.minDurationSeconds} seconds for ${config.name}.`,
      });
    }
    if (metadata.duration > config.maxDurationSeconds) {
      issues.push({
        platform,
        field: "duration",
        message: `Video duration exceeds ${config.name}'s limit of ${Math.round(config.maxDurationSeconds / 60)} minutes.`,
      });
    }
  }

  // Caption length check
  if (metadata.caption.length > config.maxCaptionLength) {
    issues.push({
      platform,
      field: "caption",
      message: `Caption length (${metadata.caption.length} chars) exceeds ${config.name}'s limit of ${config.maxCaptionLength} characters.`,
    });
  }

  return issues;
}

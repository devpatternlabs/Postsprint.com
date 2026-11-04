const MAX_YOUTUBE_TITLE_LENGTH = 100;

/**
 * Generates a clean, safe YouTube title from user input or caption.
 * Ensures the title never exceeds 100 characters and ends cleanly at word boundaries.
 */
export function generateYouTubeTitle(
  customTitle: string | null | undefined,
  caption: string
): string {
  if (customTitle && customTitle.trim().length > 0) {
    const trimmed = customTitle.trim();
    if (trimmed.length <= MAX_YOUTUBE_TITLE_LENGTH) {
      return trimmed;
    }
    return truncateAtWord(trimmed, MAX_YOUTUBE_TITLE_LENGTH);
  }

  // Fallback to caption
  const cleaned = caption
    .split("\n")[0] // Take first line
    .replace(/[#@][a-zA-Z0-9_]+/g, "") // Strip leading hashtags/mentions
    .trim();

  const titleSource = cleaned.length > 0 ? cleaned : "New Video";

  if (titleSource.length <= MAX_YOUTUBE_TITLE_LENGTH) {
    return titleSource;
  }

  return truncateAtWord(titleSource, MAX_YOUTUBE_TITLE_LENGTH);
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sub = text.slice(0, maxLength - 3);
  const lastSpace = sub.lastIndexOf(" ");
  if (lastSpace > 10) {
    return sub.slice(0, lastSpace).trim() + "...";
  }
  return sub.trim() + "...";
}

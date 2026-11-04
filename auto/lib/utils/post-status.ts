import { PostStatus, TargetStatus } from "@/types";

/**
 * Aggregates individual platform target statuses into an overall post status.
 */
export function calculateAggregatePostStatus(
  targetStatuses: TargetStatus[]
): PostStatus {
  if (targetStatuses.length === 0) {
    return "draft";
  }

  const allPublished = targetStatuses.every((s) => s === "published");
  if (allPublished) {
    return "completed";
  }

  const allFailed = targetStatuses.every((s) => s === "failed");
  if (allFailed) {
    return "failed";
  }

  const hasInFlight = targetStatuses.some(
    (s) => s === "uploading" || s === "processing"
  );
  if (hasInFlight) {
    return "publishing";
  }

  const allQueued = targetStatuses.every((s) => s === "queued");
  if (allQueued) {
    return "queued";
  }

  const hasActionRequired = targetStatuses.some((s) => s === "action_required");
  const hasPublished = targetStatuses.some((s) => s === "published");
  const hasFailed = targetStatuses.some((s) => s === "failed");

  if (hasActionRequired) {
    return hasFailed ? "partial" : "partial";
  }

  if (hasPublished && hasFailed) {
    return "partial";
  }

  // If some are queued and some are published/failed
  return "publishing";
}

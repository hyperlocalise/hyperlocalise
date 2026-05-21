import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export type NormalizedJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "waiting_for_review"
  | "cancelled";

/**
 * Map a raw provider status string to our normalized job status enum.
 * Each provider uses its own vocabulary; this function normalizes them so
 * the existing Jobs UI can filter and display external jobs consistently.
 *
 * Unknown statuses fall back to "queued" so they remain visible and
 * actionable rather than being misclassified as terminal.
 */
export function mapProviderStatusToNormalized(
  providerKind: ExternalTmsProviderKind,
  providerStatus: string,
): NormalizedJobStatus {
  const status = providerStatus.toLowerCase().trim();

  switch (providerKind) {
    case "crowdin":
      return mapCrowdinStatus(status);
    case "smartling":
      return mapSmartlingStatus(status);
    case "phrase":
      return mapPhraseStatus(status);
    case "lokalise":
      return mapLokaliseStatus(status);
    default:
      return "queued";
  }
}

function mapCrowdinStatus(status: string): NormalizedJobStatus {
  if (["done", "closed", "completed"].includes(status)) return "succeeded";
  if (["in_progress", "in-progress", "inprogress", "in progress", "active"].includes(status))
    return "running";
  if (["todo", "new", "pending", "created", "draft"].includes(status)) return "queued";
  if (["failed", "rejected", "error"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
    ].includes(status)
  )
    return "waiting_for_review";
  if (["cancelled", "canceled", "aborted"].includes(status)) return "cancelled";
  return "queued";
}

function mapSmartlingStatus(status: string): NormalizedJobStatus {
  if (["completed", "published", "done", "closed"].includes(status)) return "succeeded";
  if (
    [
      "in_progress",
      "in-progress",
      "inprogress",
      "active",
      "in_translation",
      "in-translation",
      "in translation",
    ].includes(status)
  )
    return "running";
  if (
    [
      "awaiting_authorization",
      "awaiting-authorization",
      "awaiting authorization",
      "new",
      "pending",
      "created",
      "draft",
    ].includes(status)
  )
    return "queued";
  if (["failed", "rejected", "error", "cancelled", "canceled"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
      "in_edit",
      "in-edit",
      "in edit",
    ].includes(status)
  )
    return "waiting_for_review";
  return "queued";
}

function mapPhraseStatus(status: string): NormalizedJobStatus {
  if (["completed", "done", "closed", "finished", "delivered"].includes(status)) return "succeeded";
  if (
    [
      "in_progress",
      "in-progress",
      "inprogress",
      "in progress",
      "active",
      "in_translation",
      "in-translation",
      "in translation",
      "accepted",
    ].includes(status)
  )
    return "running";
  if (["new", "pending", "created", "draft", "unclaimed", "open"].includes(status)) return "queued";
  if (["failed", "rejected", "error", "declined"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
      "review",
    ].includes(status)
  )
    return "waiting_for_review";
  if (["cancelled", "canceled", "aborted"].includes(status)) return "cancelled";
  return "queued";
}

function mapLokaliseStatus(status: string): NormalizedJobStatus {
  if (["completed", "done", "closed", "finished"].includes(status)) return "succeeded";
  if (
    [
      "in_progress",
      "in-progress",
      "inprogress",
      "in progress",
      "active",
      "in_translation",
      "in-translation",
      "in translation",
    ].includes(status)
  )
    return "running";
  if (["new", "pending", "created", "draft", "queued", "unassigned"].includes(status))
    return "queued";
  if (["failed", "rejected", "error"].includes(status)) return "failed";
  if (
    [
      "waiting_for_review",
      "waiting-for-review",
      "waiting for review",
      "in_review",
      "in-review",
      "in review",
      "reviewing",
    ].includes(status)
  )
    return "waiting_for_review";
  if (["cancelled", "canceled", "aborted", "skipped"].includes(status)) return "cancelled";
  return "queued";
}

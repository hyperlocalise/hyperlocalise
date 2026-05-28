import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

/** Returns the default provider event list stored on new subscriptions. */
export function listDefaultWebhookEvents(providerKind: ExternalTmsProviderKind) {
  if (providerKind === "crowdin") {
    return [
      "file.added",
      "file.updated",
      "file.reverted",
      "file.deleted",
      "file.translated",
      "file.approved",
      "project.translated",
      "project.approved",
      "project.built",
      "translation.updated",
      "string.added",
      "string.updated",
      "string.deleted",
      "stringComment.created",
      "stringComment.updated",
      "stringComment.deleted",
      "stringComment.restored",
      "suggestion.added",
      "suggestion.updated",
      "suggestion.deleted",
      "suggestion.approved",
      "suggestion.disapproved",
      "task.added",
      "task.statusChanged",
      "task.deleted",
    ];
  }

  if (providerKind === "smartling") {
    return [
      "file.uploaded",
      "file.published",
      "file.deleted",
      "file.translation.completed",
      "job.created",
      "job.completed",
      "job.cancelled",
      "translation.published",
      "translation.updated",
      "sourceIssue.created",
      "sourceIssue.comment.created",
      "glossary.entry.created",
      "glossary.entry.updated",
      "translationMemory.entry.created",
      "translationMemory.entry.updated",
    ];
  }

  return [];
}

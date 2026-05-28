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

  if (providerKind === "lokalise") {
    return [
      "project.key.added",
      "project.key.modified",
      "project.keys.deleted",
      "project.translation.updated",
      "project.translation.proofread",
      "project.task.created",
      "project.task.closed",
      "project.task.deleted",
      "project.task.language.closed",
      "project.imported",
      "project.exported",
      "project.languages.added",
      "project.language.settings_changed",
      "project.branch.added",
      "project.branch.deleted",
      "project.branch.merged",
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

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

  return [];
}

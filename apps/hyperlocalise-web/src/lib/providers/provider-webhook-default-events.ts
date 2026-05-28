import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

const commonSyncEvents = [
  "file.added",
  "file.updated",
  "file.translated",
  "string.added",
  "string.updated",
  "suggestion.added",
  "suggestion.updated",
  "task.added",
  "task.statusChanged",
  "project.translated",
] as const;

const defaultEventsByProvider: Record<ExternalTmsProviderKind, readonly string[]> = {
  crowdin: commonSyncEvents,
  phrase: commonSyncEvents,
  lokalise: commonSyncEvents,
  smartling: commonSyncEvents,
};

export function listDefaultWebhookEvents(providerKind: ExternalTmsProviderKind) {
  return [...defaultEventsByProvider[providerKind]];
}

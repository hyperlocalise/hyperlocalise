import type { ProviderSyncRunKind } from "@/lib/database/types";

export const PROVIDER_SYNC_INTENT_KINDS = [
  "project_scan",
  "file_key_scan",
  "job_task_scan",
  "tm_scan",
  "glossary_scan",
  "pull_content",
  "push_translations",
] as const satisfies readonly ProviderSyncRunKind[];

export type ProviderSyncIntentKind = (typeof PROVIDER_SYNC_INTENT_KINDS)[number];

const providerSyncIntentKindSet = new Set<string>(PROVIDER_SYNC_INTENT_KINDS);

export function isProviderSyncIntentKind(value: string): value is ProviderSyncIntentKind {
  return providerSyncIntentKindSet.has(value);
}

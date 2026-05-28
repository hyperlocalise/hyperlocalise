import type { ProviderSyncIntentKind } from "./provider-sync-intent-kinds";

export type ProviderWebhookSyncKind = ProviderSyncIntentKind | "unknown";

export function resolveSyncKindFromWebhookEvent(input: {
  eventType: string;
  resourceType?: string | null;
}): ProviderWebhookSyncKind {
  const eventType = input.eventType.toLowerCase();
  const resourceType = input.resourceType?.toLowerCase() ?? null;

  if (eventType.startsWith("project.") || resourceType === "project") {
    return "project_scan";
  }

  if (
    eventType.includes("file") ||
    eventType.includes("string") ||
    resourceType === "file" ||
    resourceType === "key"
  ) {
    return "file_key_scan";
  }

  if (
    eventType.includes("job") ||
    eventType.includes("task") ||
    resourceType === "job" ||
    resourceType === "task"
  ) {
    return "job_task_scan";
  }

  if (eventType.includes("glossary") || eventType.includes("term") || resourceType === "glossary") {
    return "glossary_scan";
  }

  if (
    eventType.includes("translation_memory") ||
    eventType.includes("tm") ||
    resourceType === "translation_memory" ||
    resourceType === "tm"
  ) {
    return "tm_scan";
  }

  if (eventType.includes("translation") && eventType.includes("push")) {
    return "push_translations";
  }

  if (eventType.includes("translation") || eventType.includes("content")) {
    return "pull_content";
  }

  return "unknown";
}

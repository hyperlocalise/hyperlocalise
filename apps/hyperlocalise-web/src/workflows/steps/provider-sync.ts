import type { ProviderSyncEventData } from "@/lib/workflow/types";

export async function executeProviderSyncIntentStep(event: ProviderSyncEventData) {
  "use step";
  const { runProviderSyncIntentById } = await import("@/lib/providers/provider-sync-worker");
  return runProviderSyncIntentById({
    intentId: event.providerSyncIntentId,
    organizationId: event.organizationId,
  });
}

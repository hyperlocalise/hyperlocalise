import type { ProviderSyncIntentKind } from "./provider-sync-intent-kinds";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function buildProviderSyncIntentLeaseKey(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  projectId?: string | null;
  syncKind: ProviderSyncIntentKind;
  resourceId?: string | null;
}) {
  const projectSegment = input.projectId ?? "";
  const resourceSegment = input.resourceId ?? "";

  return [
    input.organizationId,
    input.providerKind,
    projectSegment,
    input.syncKind,
    resourceSegment,
  ].join(":");
}

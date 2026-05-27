import { createHash } from "node:crypto";

import type { ProviderSyncIntentKind } from "./provider-sync-intent-kinds";
import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

export function buildProviderSyncIntentLeaseKey(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  projectId?: string | null;
  syncKind: ProviderSyncIntentKind;
  resourceId?: string | null;
}) {
  const keyParts = [
    input.organizationId,
    input.providerKind,
    input.projectId ?? null,
    input.syncKind,
    input.resourceId ?? null,
  ];

  return `sha256:${createHash("sha256").update(JSON.stringify(keyParts)).digest("hex")}`;
}

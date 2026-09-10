/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq } from "drizzle-orm";

import { hasCapability, type OrganizationCapability } from "@/api/auth/policy";
import { canAccessMemory } from "@/api/auth/team-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema } from "@/lib/database/client";
import type { Memory } from "@/lib/database/types";
import {
  isLiveProviderMemoryId,
  parseLiveProviderMemoryId,
} from "@/lib/providers/jobs/tms-provider-resource-id";
import {
  listTmsProviderLiveTranslationMemories,
  type TmsProviderLiveTranslationMemory,
} from "@/lib/providers/jobs/tms-provider-live";
import { providerSupportsTranslationMemoryMatch } from "@/lib/providers/adapters/tms-provider-registry";

export const MEMORY_CAPABILITY_ACTIONS = [
  "read",
  "search",
  "edit",
  "review",
  "import",
  "export",
  "bulk_mutation",
  "archive",
  "restore",
  "delete",
] as const;

export type MemoryCapabilityAction = (typeof MEMORY_CAPABILITY_ACTIONS)[number];

export const MEMORY_CAPABILITY_REASONS = [
  "unauthorized",
  "unsupported",
  "read_only",
  "archived",
  "unavailable",
] as const;

export type MemoryCapabilityReason = (typeof MEMORY_CAPABILITY_REASONS)[number];

export type MemoryCapabilityDecision = {
  allowed: boolean;
  reason: MemoryCapabilityReason | null;
};

export type MemoryCapabilities = Record<MemoryCapabilityAction, MemoryCapabilityDecision>;

export type MemoryCapabilityResource = {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  source: "native" | "external_tms";
  resourceKind: "native" | "synced" | "live_provider" | "reference_only";
  externalProviderKind: Memory["externalProviderKind"];
  externalProjectId: string | null;
  externalMemoryId: string | null;
  localeCoverage: string[];
  segmentCount: number | null;
  capabilityMode: Memory["capabilityMode"];
  segmentCapabilities: Record<string, unknown>;
  externalUrl: string | null;
  lastSyncedAt: Date | null;
  lastSyncErrorAt: Date | null;
  lastSyncErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  persistedMemory: Memory | null;
};

export type ResolvedMemoryCapabilities = {
  resource: MemoryCapabilityResource;
  capabilities: MemoryCapabilities;
};

export type ResolveMemoryResult =
  | { kind: "resolved"; value: ResolvedMemoryCapabilities }
  | { kind: "not_found" }
  | { kind: "unavailable" };

function decision(allowed: boolean, reason: MemoryCapabilityReason | null = null) {
  return { allowed, reason } satisfies MemoryCapabilityDecision;
}

function deniedCapabilities(reason: MemoryCapabilityReason): MemoryCapabilities {
  return Object.fromEntries(
    MEMORY_CAPABILITY_ACTIONS.map((action) => [action, decision(false, reason)]),
  ) as MemoryCapabilities;
}

function roleAllows(auth: ApiAuthContext, capability: OrganizationCapability) {
  return hasCapability(auth.membership.role, capability);
}

function nativeCapabilities(
  auth: ApiAuthContext,
  resource: MemoryCapabilityResource,
): MemoryCapabilities {
  const canWrite = roleAllows(auth, "memories:write");
  const canReview = roleAllows(auth, "memories:review");
  const archived = resource.status === "archived";
  const readable = roleAllows(auth, "memories:read");

  return {
    read: readable ? decision(true) : decision(false, "unauthorized"),
    search: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : decision(true),
    edit: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : canWrite
          ? decision(true)
          : decision(false, "unauthorized"),
    review: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : canReview
          ? decision(true)
          : decision(false, "unauthorized"),
    import: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : canWrite
          ? decision(true)
          : decision(false, "unauthorized"),
    export: readable ? decision(true) : decision(false, "unauthorized"),
    bulk_mutation: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : canWrite
          ? decision(true)
          : decision(false, "unauthorized"),
    archive: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : canWrite
          ? decision(true)
          : decision(false, "unauthorized"),
    restore: !readable
      ? decision(false, "unauthorized")
      : !archived
        ? decision(false, "unsupported")
        : canWrite
          ? decision(true)
          : decision(false, "unauthorized"),
    delete: !readable
      ? decision(false, "unauthorized")
      : archived
        ? decision(false, "archived")
        : canWrite
          ? decision(true)
          : decision(false, "unauthorized"),
  };
}

function externalCapabilities(
  auth: ApiAuthContext,
  resource: MemoryCapabilityResource,
): MemoryCapabilities {
  const readable = roleAllows(auth, "memories:read");
  const providerKind = resource.externalProviderKind;
  const supportsSearch =
    (resource.resourceKind === "synced" || resource.resourceKind === "live_provider") &&
    resource.capabilityMode !== "reference_only" &&
    providerKind != null &&
    providerSupportsTranslationMemoryMatch(providerKind);

  return {
    read: readable ? decision(true) : decision(false, "unauthorized"),
    search: !readable
      ? decision(false, "unauthorized")
      : supportsSearch
        ? decision(true)
        : decision(false, "unsupported"),
    edit: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
    review: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
    import: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
    export: !readable
      ? decision(false, "unauthorized")
      : resource.persistedMemory
        ? decision(true)
        : decision(false, "unsupported"),
    bulk_mutation: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
    archive: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
    restore: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
    delete: readable ? decision(false, "read_only") : decision(false, "unauthorized"),
  };
}

function resourceFromPersistedMemory(memory: Memory): MemoryCapabilityResource {
  const source = memory.source ?? "native";
  const status = memory.status ?? "active";
  const resourceKind =
    source === "native"
      ? "native"
      : memory.capabilityMode === "reference_only"
        ? "reference_only"
        : "synced";

  return {
    id: memory.id,
    organizationId: memory.organizationId,
    name: memory.name,
    description: memory.description,
    status,
    source,
    resourceKind,
    externalProviderKind: memory.externalProviderKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.externalMemoryId,
    localeCoverage: memory.localeCoverage,
    segmentCount: memory.segmentCount,
    capabilityMode: memory.capabilityMode,
    segmentCapabilities: memory.segmentCapabilities,
    externalUrl: memory.externalUrl,
    lastSyncedAt: memory.lastSyncedAt,
    lastSyncErrorAt: memory.lastSyncErrorAt,
    lastSyncErrorMessage: memory.lastSyncErrorMessage,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    persistedMemory: memory,
  };
}

function resourceFromLiveMemory(
  memory: TmsProviderLiveTranslationMemory,
  providerKind: NonNullable<Memory["externalProviderKind"]>,
  organizationId = "",
): MemoryCapabilityResource {
  const now = new Date();
  const supportsSearch = providerSupportsTranslationMemoryMatch(providerKind);

  return {
    id: memory.id,
    organizationId,
    name: memory.name,
    description: memory.description ?? "",
    status: "active",
    source: "external_tms",
    resourceKind: supportsSearch ? "live_provider" : "reference_only",
    externalProviderKind: providerKind,
    externalProjectId: memory.externalProjectId,
    externalMemoryId: memory.id.split(":").at(-1) ?? memory.id,
    localeCoverage: memory.localeCoverage,
    segmentCount: memory.segmentCount,
    capabilityMode: supportsSearch ? "live_search" : "reference_only",
    segmentCapabilities: supportsSearch ? { search: true } : {},
    externalUrl: memory.externalUrl,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    persistedMemory: null,
  };
}

export function memoryCapabilitiesForLiveProviderMemory(
  auth: ApiAuthContext,
  memory: TmsProviderLiveTranslationMemory,
  providerKind: NonNullable<Memory["externalProviderKind"]>,
) {
  const resource = resourceFromLiveMemory(
    memory,
    providerKind,
    auth.organization.localOrganizationId,
  );
  return {
    resource,
    capabilities: externalCapabilities(auth, resource),
  } satisfies ResolvedMemoryCapabilities;
}

export async function resolveMemoryCapabilities(
  auth: ApiAuthContext,
  memoryId: string,
): Promise<ResolveMemoryResult> {
  if (isLiveProviderMemoryId(memoryId)) {
    const parsed = parseLiveProviderMemoryId(memoryId);
    if (!parsed) {
      return { kind: "not_found" };
    }

    try {
      const liveMemories = await listTmsProviderLiveTranslationMemories(
        auth.organization.localOrganizationId,
        { actorUserId: auth.user.localUserId },
      );
      const liveMemory = liveMemories.find((memory) => memory.id === memoryId);
      if (!liveMemory) {
        return { kind: "not_found" };
      }

      const { resource, capabilities } = memoryCapabilitiesForLiveProviderMemory(
        auth,
        liveMemory,
        parsed.providerKind,
      );
      return {
        kind: "resolved",
        value: { resource, capabilities },
      };
    } catch {
      return { kind: "unavailable" };
    }
  }

  const accessible = await canAccessMemory(auth, memoryId);
  if (!accessible) {
    return { kind: "not_found" };
  }

  const [memory] = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.id, memoryId),
        eq(schema.memories.organizationId, auth.organization.localOrganizationId),
      ),
    )
    .limit(1);

  if (!memory) {
    return { kind: "not_found" };
  }

  const resource = resourceFromPersistedMemory(memory);
  return {
    kind: "resolved",
    value: {
      resource,
      capabilities:
        resource.source === "native"
          ? nativeCapabilities(auth, resource)
          : externalCapabilities(auth, resource),
    },
  };
}

export function memoryCapabilitiesForPersistedMemory(
  auth: ApiAuthContext,
  memory: Memory,
): ResolvedMemoryCapabilities {
  const resource = resourceFromPersistedMemory(memory);
  return {
    resource,
    capabilities:
      resource.source === "native"
        ? nativeCapabilities(auth, resource)
        : externalCapabilities(auth, resource),
  };
}

export function capabilityDeniedReason(
  capabilities: MemoryCapabilities,
  action: MemoryCapabilityAction,
) {
  return capabilities[action].reason ?? "unauthorized";
}

export function isMemoryCapabilityAllowed(
  capabilities: MemoryCapabilities,
  action: MemoryCapabilityAction,
) {
  return capabilities[action].allowed;
}

export function deniedMemoryCapabilities(reason: MemoryCapabilityReason) {
  return deniedCapabilities(reason);
}

/**
 * Background writers run without an interactive membership context. They
 * still use the same resource policy: only active native memories are
 * writable by server-side translation jobs.
 */
export function isMemoryWritableForExecution(memory: Pick<Memory, "source" | "status">) {
  return memory.source === "native" && memory.status === "active";
}

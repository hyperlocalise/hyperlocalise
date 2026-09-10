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
import { describe, expect, it } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import type { Memory, OrganizationMembershipRole } from "@/lib/database/types";

import {
  capabilityDeniedReason,
  deniedMemoryCapabilities,
  isMemoryCapabilityAllowed,
  isMemorySearchableForExecution,
  isMemoryWritableForExecution,
  memoryCapabilitiesForLiveProviderMemory,
  memoryCapabilitiesForPersistedMemory,
  type MemoryCapabilityAction,
} from "./memory-capabilities";

function authForRole(role: OrganizationMembershipRole): ApiAuthContext {
  return {
    membership: { role, accessSource: "workos" },
    organization: { localOrganizationId: "org_1" },
  } as unknown as ApiAuthContext;
}

function persistedMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "memory_1",
    organizationId: "org_1",
    createdByUserId: null,
    name: "Default TM",
    description: "",
    status: "active",
    source: "native",
    externalProviderKind: null,
    externalProviderCredentialId: null,
    externalProjectId: null,
    externalMemoryId: null,
    externalUrl: null,
    capabilityMode: null,
    segmentCapabilities: {},
    localeCoverage: ["en"],
    segmentCount: 0,
    syncState: null,
    providerMetadata: {},
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Memory;
}

function expectAllowed(
  capabilities: ReturnType<typeof memoryCapabilitiesForPersistedMemory>["capabilities"],
  actions: MemoryCapabilityAction[],
) {
  for (const action of actions) {
    expect(capabilities[action], action).toEqual({ allowed: true, reason: null });
  }
}

function expectDenied(
  capabilities: ReturnType<typeof memoryCapabilitiesForPersistedMemory>["capabilities"],
  actions: MemoryCapabilityAction[],
  reason: string,
) {
  for (const action of actions) {
    expect(capabilities[action], action).toEqual({ allowed: false, reason });
  }
}

describe("memoryCapabilitiesForPersistedMemory (native)", () => {
  it("grants managers full write access on active native memories", () => {
    const { capabilities, resource } = memoryCapabilitiesForPersistedMemory(
      authForRole("localization_manager"),
      persistedMemory(),
    );

    expect(resource.resourceKind).toBe("native");
    expectAllowed(capabilities, [
      "read",
      "search",
      "edit",
      "review",
      "import",
      "export",
      "bulk_mutation",
      "archive",
      "delete",
    ]);
    expectDenied(capabilities, ["restore"], "unsupported");
  });

  it("lets reviewers review but not edit active native memories", () => {
    const { capabilities } = memoryCapabilitiesForPersistedMemory(
      authForRole("reviewer"),
      persistedMemory(),
    );

    expectAllowed(capabilities, ["read", "search", "review", "export"]);
    expectDenied(
      capabilities,
      ["edit", "import", "bulk_mutation", "archive", "delete"],
      "unauthorized",
    );
    expectDenied(capabilities, ["restore"], "unsupported");
  });

  it("blocks search and mutations on archived native memories, but allows restore for writers", () => {
    const { capabilities } = memoryCapabilitiesForPersistedMemory(
      authForRole("admin"),
      persistedMemory({ status: "archived" }),
    );

    expectAllowed(capabilities, ["read", "export", "restore"]);
    expectDenied(
      capabilities,
      ["search", "edit", "review", "import", "bulk_mutation", "archive", "delete"],
      "archived",
    );
  });

  it("denies restore on archived memories when the role cannot write", () => {
    const { capabilities } = memoryCapabilitiesForPersistedMemory(
      authForRole("member"),
      persistedMemory({ status: "archived" }),
    );

    expectAllowed(capabilities, ["read", "export"]);
    expectDenied(capabilities, ["restore"], "unauthorized");
  });
});

describe("memoryCapabilitiesForPersistedMemory (external)", () => {
  it("allows search on synced external memories whose provider supports TM match", () => {
    const { capabilities, resource } = memoryCapabilitiesForPersistedMemory(
      authForRole("member"),
      persistedMemory({
        source: "external_tms",
        externalProviderKind: "crowdin",
        capabilityMode: "synced_import",
        externalProjectId: "proj_1",
        externalMemoryId: "tm_1",
      }),
    );

    expect(resource.resourceKind).toBe("synced");
    expectAllowed(capabilities, ["read", "search", "export"]);
    expectDenied(
      capabilities,
      ["edit", "review", "import", "bulk_mutation", "archive", "restore", "delete"],
      "read_only",
    );
  });

  it("marks reference-only external memories as unsupported for search", () => {
    const { capabilities, resource } = memoryCapabilitiesForPersistedMemory(
      authForRole("member"),
      persistedMemory({
        source: "external_tms",
        externalProviderKind: "crowdin",
        capabilityMode: "reference_only",
        externalProjectId: "proj_1",
        externalMemoryId: "tm_1",
      }),
    );

    expect(resource.resourceKind).toBe("reference_only");
    expectAllowed(capabilities, ["read", "export"]);
    expectDenied(capabilities, ["search"], "unsupported");
  });
});

describe("memoryCapabilitiesForLiveProviderMemory", () => {
  it("allows search but not export for live provider memories without a persisted row", () => {
    const { capabilities, resource } = memoryCapabilitiesForLiveProviderMemory(
      authForRole("member"),
      {
        id: "live:crowdin:proj_1:tm_1",
        name: "Live Crowdin TM",
        description: null,
        sourceLocale: "en",
        localeCoverage: ["en", "fr"],
        segmentCount: 12,
        externalUrl: null,
        externalProjectId: "proj_1",
        projectName: "Acme",
      },
      "crowdin",
    );

    expect(resource.resourceKind).toBe("live_provider");
    expect(resource.persistedMemory).toBeNull();
    expectAllowed(capabilities, ["read", "search"]);
    expectDenied(capabilities, ["export"], "unsupported");
    expectDenied(capabilities, ["edit", "delete"], "read_only");
  });
});

describe("execution helpers and denial helpers", () => {
  it("only treats active native memories as writable for background jobs", () => {
    expect(isMemoryWritableForExecution({ source: "native", status: "active" })).toBe(true);
    expect(isMemoryWritableForExecution({ source: "native", status: "archived" })).toBe(false);
    expect(isMemoryWritableForExecution({ source: "external_tms", status: "active" })).toBe(false);
  });

  it("allows searchable execution for active synced external memories with TM match", () => {
    expect(
      isMemorySearchableForExecution({
        source: "external_tms",
        status: "active",
        capabilityMode: "synced_import",
        externalProviderKind: "phrase",
      }),
    ).toBe(true);
    expect(
      isMemorySearchableForExecution({
        source: "external_tms",
        status: "active",
        capabilityMode: "reference_only",
        externalProviderKind: "phrase",
      }),
    ).toBe(false);
    expect(
      isMemorySearchableForExecution({
        source: "native",
        status: "draft",
        capabilityMode: null,
        externalProviderKind: null,
      }),
    ).toBe(false);
  });

  it("exposes capability denial helpers", () => {
    const denied = deniedMemoryCapabilities("unavailable");
    expect(isMemoryCapabilityAllowed(denied, "read")).toBe(false);
    expect(capabilityDeniedReason(denied, "search")).toBe("unavailable");

    const active = memoryCapabilitiesForPersistedMemory(
      authForRole("admin"),
      persistedMemory(),
    ).capabilities;
    expect(capabilityDeniedReason(active, "restore")).toBe("unsupported");
  });
});

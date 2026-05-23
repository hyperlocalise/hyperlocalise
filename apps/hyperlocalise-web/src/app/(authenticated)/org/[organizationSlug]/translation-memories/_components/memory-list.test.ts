import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectIdByExternalKey,
  externalProjectLookupKey,
  mapMemoryToListRow,
} from "./memory-list";

describe("memory-list", () => {
  it("maps native and provider memories with project links", () => {
    const projectMap = buildProjectIdByExternalKey([
      {
        id: "project-1",
        externalProviderKind: "phrase",
        externalProjectId: "phrase-project-9",
      },
    ]);

    const native = mapMemoryToListRow(
      {
        id: "mem-native",
        organizationId: "org-1",
        createdByUserId: null,
        name: "Product UI",
        description: "",
        status: "active",
        source: "native",
        externalProviderKind: null,
        externalProjectId: null,
        externalMemoryId: null,
        localeCoverage: ["en", "de"],
        segmentCount: 1200,
        syncState: null,
        capabilityMode: null,
        segmentCapabilities: {},
        externalUrl: null,
        lastSyncedAt: null,
        lastSyncErrorAt: null,
        lastSyncErrorMessage: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      projectMap,
    );

    const provider = mapMemoryToListRow(
      {
        id: "mem-provider",
        organizationId: "org-1",
        createdByUserId: null,
        name: "Phrase TM",
        description: "Marketing",
        status: "active",
        source: "external_tms",
        externalProviderKind: "phrase",
        externalProjectId: "phrase-project-9",
        externalMemoryId: "tm-42",
        localeCoverage: ["en", "fr", "de", "es"],
        segmentCount: 50_000,
        syncState: "synced",
        capabilityMode: "live_search",
        segmentCapabilities: { search: true },
        externalUrl: "https://phrase.com/tm/42",
        lastSyncedAt: "2026-05-20T12:00:00.000Z",
        lastSyncErrorAt: null,
        lastSyncErrorMessage: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
      projectMap,
    );

    expect(native.capabilityLabel).toBe("Workspace managed");
    expect(native.localeSummary).toBe("en, de");
    expect(native.segmentCountLabel).toBe("1.2k");
    expect(provider.capabilityLabel).toBe("Live search");
    expect(provider.localeSummary).toBe("en, fr, de +1");
    expect(provider.segmentCountLabel).toBe("50.0k");
    expect(provider.projectLinkId).toBe("project-1");
    expect(externalProjectLookupKey("phrase", "phrase-project-9")).toBe("phrase:phrase-project-9");
  });
});

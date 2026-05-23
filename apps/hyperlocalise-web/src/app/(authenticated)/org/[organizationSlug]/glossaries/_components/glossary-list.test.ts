import { describe, expect, it } from "vite-plus/test";

import {
  buildProjectIdByExternalKey,
  externalProjectLookupKey,
  mapGlossaryToListRow,
} from "./glossary-list";

describe("glossary-list", () => {
  it("maps native and provider glossaries with project links", () => {
    const projectMap = buildProjectIdByExternalKey([
      {
        id: "project-1",
        externalProviderKind: "phrase",
        externalProjectId: "phrase-project-9",
      },
    ]);

    const native = mapGlossaryToListRow(
      {
        id: "glossary-native",
        organizationId: "org-1",
        createdByUserId: null,
        name: "Product UI",
        description: "",
        sourceLocale: "en",
        targetLocale: "de",
        status: "active",
        source: "native",
        externalProviderKind: null,
        externalProjectId: null,
        externalResourceType: null,
        externalGlossaryId: null,
        localeCoverage: ["en", "de"],
        termCount: 120,
        syncState: null,
        termCapabilities: {},
        externalUrl: null,
        lastSyncedAt: null,
        lastSyncErrorAt: null,
        lastSyncErrorMessage: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      projectMap,
    );

    const provider = mapGlossaryToListRow(
      {
        id: "glossary-provider",
        organizationId: "org-1",
        createdByUserId: null,
        name: "Phrase Term Base",
        description: "Marketing",
        sourceLocale: "en",
        targetLocale: "fr",
        status: "active",
        source: "external_tms",
        externalProviderKind: "phrase",
        externalProjectId: "phrase-project-9",
        externalResourceType: "term_base",
        externalGlossaryId: "tb-42",
        localeCoverage: ["en", "fr", "de", "es"],
        termCount: 4_200,
        syncState: "synced",
        termCapabilities: { preferredTerms: true, forbiddenTerms: true },
        externalUrl: "https://phrase.com/tb/42",
        lastSyncedAt: "2026-05-20T12:00:00.000Z",
        lastSyncErrorAt: null,
        lastSyncErrorMessage: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
      projectMap,
    );

    expect(native.resourceTypeLabel).toBe("Workspace glossary");
    expect(native.termCapabilityLabel).toBe("Preferred · Forbidden");
    expect(native.localeSummary).toBe("en, de");
    expect(native.termCountLabel).toBe("120");
    expect(provider.resourceTypeLabel).toBe("Term base");
    expect(provider.localeSummary).toBe("en, fr, de +1");
    expect(provider.termCountLabel).toBe("4.2k");
    expect(provider.projectLinkId).toBe("project-1");
    expect(externalProjectLookupKey("phrase", "phrase-project-9")).toBe("phrase:phrase-project-9");
  });
});

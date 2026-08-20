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

import {
  buildProjectIdByExternalKey,
  externalProjectLookupKey,
  mapLiveTmsProviderGlossaryToListRow,
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
        languages: [
          { locale: "en", name: "English", isSource: true },
          { locale: "de", name: "German", isSource: false },
        ],
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
        languages: [],
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
    expect(native.localeSummary).toBe("English (en), German (de)");
    expect(native.sourceLocaleLabel).toBe("English");
    expect(native.secondaryLocaleSummary).toBe("German");
    expect(native.termCountLabel).toBe("120");
    expect(provider.resourceTypeLabel).toBe("Term base");
    expect(provider.localeSummary).toBe("English, French, German +1");
    expect(provider.sourceLocaleLabel).toBe("English");
    expect(provider.secondaryLocaleSummary).toBe("French, German, Spanish");
    expect(provider.termCountLabel).toBe("4.2k");
    expect(provider.projectLinkId).toBe("project-1");
    expect(externalProjectLookupKey("phrase", "phrase-project-9")).toBe("phrase:phrase-project-9");
  });

  it("labels live provider glossaries as live API", () => {
    const row = mapLiveTmsProviderGlossaryToListRow(
      {
        id: "crowdin:glossary:gl-99",
        name: "Crowdin Glossary",
        description: null,
        sourceLocale: "en",
        targetLocale: "de",
        localeCoverage: ["en", "de"],
        termCount: 85,
        externalUrl: "https://crowdin.com/project/acme/glossary/gl-99",
        externalProjectId: "crowdin-project-1",
        projectName: "Acme",
      },
      "crowdin",
    );

    expect(row.termCapabilityLabel).toBe("Live API");
  });
});

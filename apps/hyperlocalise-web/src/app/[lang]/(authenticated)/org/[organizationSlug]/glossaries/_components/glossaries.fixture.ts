import type { GlossaryRecord } from "@/api/routes/glossary/glossary.schema";

import {
  buildProjectIdByExternalKey,
  mapGlossaryToListRow,
  type GlossaryListRow,
} from "./glossary-list";

const fixedNow = "2026-06-07T12:00:00.000Z";

const projectMap = buildProjectIdByExternalKey([
  {
    id: "project-1",
    externalProviderKind: "phrase",
    externalProjectId: "phrase-project-9",
  },
]);

function createApiGlossary(overrides: Partial<GlossaryRecord> = {}): GlossaryRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "org-1",
    createdByUserId: null,
    name: "Product UI",
    description: "Core product terminology",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    status: "active",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    externalResourceType: null,
    externalGlossaryId: null,
    localeCoverage: ["en-US", "fr-FR"],
    termCount: 120,
    syncState: null,
    termCapabilities: { preferredTerms: true, forbiddenTerms: true },
    externalUrl: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

export function createGlossaryListRow(overrides: Partial<GlossaryListRow> = {}): GlossaryListRow {
  return {
    ...mapGlossaryToListRow(createApiGlossary(), projectMap),
    ...overrides,
  };
}

export const glossariesFixture: GlossaryListRow[] = [
  createGlossaryListRow(),
  mapGlossaryToListRow(
    createApiGlossary({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Phrase Term Base",
      description: "Marketing terminology",
      source: "external_tms",
      externalProviderKind: "phrase",
      externalProjectId: "phrase-project-9",
      externalResourceType: "term_base",
      externalGlossaryId: "tb-42",
      localeCoverage: ["en-US", "fr-FR", "de-DE", "es-ES"],
      termCount: 4_200,
      syncState: "synced",
      externalUrl: "https://phrase.com/tb/42",
      lastSyncedAt: "2026-05-20T12:00:00.000Z",
    }),
    projectMap,
  ),
  mapGlossaryToListRow(
    createApiGlossary({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Crowdin Glossary",
      description: "",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "crowdin-project-1",
      externalResourceType: "glossary",
      externalGlossaryId: "gl-99",
      localeCoverage: ["en-US", "de-DE"],
      termCount: 85,
      syncState: "error",
      lastSyncErrorAt: "2026-05-19T08:00:00.000Z",
      lastSyncErrorMessage: "Provider API rate limit exceeded",
    }),
    projectMap,
  ),
];

export function createEmptyGlossaryFormFixture() {
  return {
    name: "",
    description: "",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  };
}

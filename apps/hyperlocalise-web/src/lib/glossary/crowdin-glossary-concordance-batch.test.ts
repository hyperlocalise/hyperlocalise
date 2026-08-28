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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import type { Glossary as GlossaryRecord } from "@/lib/database/types";

const mocks = vi.hoisted(() => ({
  glossaryConcordanceSearch: vi.fn(),
  resolveCrowdinContext: vi.fn(),
}));

vi.mock("@/lib/providers/adapters/crowdin/crowdin-api", () => ({
  CrowdinApiClient: class {
    glossaryConcordanceSearch = mocks.glossaryConcordanceSearch;
  },
}));

vi.mock("./glossary-provider", () => ({
  parseId: (value: string, label: string) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error(`invalid_crowdin_${label}`);
    }
    return id;
  },
  resolveCrowdinContext: (...args: unknown[]) => mocks.resolveCrowdinContext(...args),
  toCrowdinContext: (input: {
    organizationId: string;
    externalProjectId: string;
    sourceLocale: string;
    targetLocales: string[];
    credential: unknown;
    secretMaterial: string;
    signal?: AbortSignal;
  }) => ({
    organizationId: input.organizationId,
    projectId: input.externalProjectId,
    externalProjectId: input.externalProjectId,
    credential: input.credential,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
    secretMaterial: input.secretMaterial,
    signal: input.signal,
  }),
}));

import { searchAttachedCrowdinGlossaryConcordance } from "./crowdin-glossary";

function authContext(): ApiAuthContext {
  return {
    organization: { localOrganizationId: "org-1" },
    user: { localUserId: "user-1" },
  } as ApiAuthContext;
}

function crowdinGlossary(overrides: Partial<GlossaryRecord> = {}): GlossaryRecord {
  return {
    id: "crowdin:glossary:718785",
    organizationId: "org-1",
    createdByUserId: null,
    name: "Product terms",
    description: "",
    sourceLocale: "en",
    targetLocale: "fr",
    status: "active",
    source: "external_tms",
    externalProviderKind: "crowdin",
    externalProviderCredentialId: null,
    externalProjectId: "902807",
    externalResourceType: "glossary",
    externalGlossaryId: "718785",
    localeCoverage: [],
    termCount: 0,
    syncState: null,
    termCapabilities: {},
    externalUrl: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    providerMetadata: {},
    controlLevel: "org",
    teamId: null,
    createdAt: new Date("2026-08-20T00:00:00Z"),
    updatedAt: new Date("2026-08-20T00:00:00Z"),
    ...overrides,
  };
}

describe("searchAttachedCrowdinGlossaryConcordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCrowdinContext.mockResolvedValue({
      organizationId: "org-1",
      externalProjectId: "902807",
      sourceLocale: "en",
      credential: { baseUrl: null },
      secretMaterial: "secret",
    });
    mocks.glossaryConcordanceSearch.mockResolvedValue([
      {
        glossary: { id: 718785, webUrl: "https://crowdin.com/glossary/718785" },
        sourceTerms: [{ id: 1, languageId: "en", text: "Save", status: "preferred" }],
        targetTerms: [{ id: 2, languageId: "fr", text: "Enregistrer", status: "preferred" }],
      },
      {
        glossary: { id: 900001, webUrl: "https://crowdin.com/glossary/900001" },
        sourceTerms: [{ id: 3, languageId: "en", text: "Cancel", status: "preferred" }],
        targetTerms: [{ id: 4, languageId: "fr", text: "Annuler", status: "preferred" }],
      },
    ]);
  });

  it("calls project-wide concordance search once per target locale for multiple glossaries", async () => {
    const attachedGlossaries = [
      crowdinGlossary(),
      crowdinGlossary({
        id: "crowdin:glossary:900001",
        name: "UI terms",
        externalGlossaryId: "900001",
      }),
    ];

    const matches = await searchAttachedCrowdinGlossaryConcordance({
      providerContext: {
        auth: authContext(),
        glossary: attachedGlossaries[0]!,
      },
      attachedGlossaries,
      query: {
        sourceLocale: "en",
        targetLocales: ["fr", "de"],
        sourceText: "Save",
        limit: 20,
      },
    });

    expect(mocks.glossaryConcordanceSearch).toHaveBeenCalledTimes(2);
    expect(matches).toHaveLength(4);
    expect(matches.map((match) => match.glossaryId)).toEqual(
      expect.arrayContaining([
        "crowdin:glossary:718785",
        "crowdin:glossary:900001",
        "crowdin:glossary:718785",
        "crowdin:glossary:900001",
      ]),
    );
    expect(new Set(matches.map((match) => match.targetLocale))).toEqual(new Set(["fr", "de"]));
  });
});

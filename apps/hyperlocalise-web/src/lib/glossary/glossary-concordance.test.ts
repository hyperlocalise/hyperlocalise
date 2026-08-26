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

import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";

const mocks = vi.hoisted(() => ({
  createGlossary: vi.fn(),
  searchAttachedCrowdinGlossaryConcordance: vi.fn(),
  selectGlossaries: vi.fn(),
  selectAttachedGlossaries: vi.fn(),
}));

vi.mock("@/lib/glossary/glossary-provider", () => ({
  createGlossary: (...args: unknown[]) => mocks.createGlossary(...args),
}));

vi.mock("@/lib/glossary/crowdin-glossary", () => ({
  searchAttachedCrowdinGlossaryConcordance: (...args: unknown[]) =>
    mocks.searchAttachedCrowdinGlossaryConcordance(...args),
}));

vi.mock("@/lib/database", () => ({
  db: {
    select: (selection?: unknown) => {
      if (selection && typeof selection === "object" && "glossary" in selection) {
        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => mocks.selectAttachedGlossaries(),
              }),
            }),
          }),
        };
      }

      return {
        from: () => ({
          where: () => mocks.selectGlossaries(),
        }),
      };
    },
  },
  schema: {
    glossaries: {
      id: "id",
      status: "status",
      source: "source",
      externalProviderKind: "external_provider_kind",
      externalGlossaryId: "external_glossary_id",
      termCapabilities: "term_capabilities",
    },
    projectGlossaries: {
      projectId: "project_id",
      glossaryId: "glossary_id",
      organizationId: "organization_id",
    },
    projects: {
      id: "id",
      source: "source",
      organizationId: "organization_id",
    },
  },
}));

import { searchGlossaryConcordance } from "./glossary-concordance";

function nativeMatch(glossaryId: string): NormalizedGlossaryMatch {
  return {
    id: `${glossaryId}:match`,
    glossaryId,
    glossaryName: "Native glossary",
    sourceTerm: "Save",
    targetTerm: "Enregistrer",
    sourceLocale: "en",
    targetLocale: "fr",
    description: null,
    caseSensitive: false,
    rank: 1,
    matchSource: "synced_database",
    providerKind: null,
    resourceId: glossaryId,
    externalResourceId: null,
    externalTermId: null,
    termStatus: { forbidden: false, preferred: true },
  };
}

describe("searchGlossaryConcordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchAttachedCrowdinGlossaryConcordance.mockResolvedValue([]);
    mocks.selectGlossaries.mockResolvedValue([
      {
        id: "native-good",
        name: "Good glossary",
        source: "native",
        status: "active",
        termCapabilities: {},
      },
      {
        id: "native-bad",
        name: "Bad glossary",
        source: "native",
        status: "active",
        termCapabilities: {},
      },
    ]);
    mocks.createGlossary.mockImplementation(({ glossary }: { glossary: { id: string } }) => ({
      searchConcordance:
        glossary.id === "native-bad"
          ? vi.fn().mockRejectedValue(new Error("provider_credential_not_found"))
          : vi.fn().mockResolvedValue([nativeMatch(glossary.id)]),
    }));
  });

  it("returns matches from healthy native glossaries when another adapter rejects asynchronously", async () => {
    const matches = await searchGlossaryConcordance({
      organizationId: "org-1",
      glossaryIds: ["native-good", "native-bad"],
      sourceLocale: "en",
      targetLocales: ["fr"],
      sourceText: "Save",
    });

    expect(matches).toEqual([nativeMatch("native-good")]);
  });

  it("batches attached Crowdin glossaries into one concordance search", async () => {
    mocks.selectAttachedGlossaries.mockResolvedValue([
      {
        glossary: {
          id: "crowdin:glossary:718785",
          name: "Product terms",
          source: "external_tms",
          externalProviderKind: "crowdin",
          externalGlossaryId: "718785",
          status: "active",
          termCapabilities: {},
        },
        projectSource: "external_tms",
      },
      {
        glossary: {
          id: "crowdin:glossary:900001",
          name: "UI terms",
          source: "external_tms",
          externalProviderKind: "crowdin",
          externalGlossaryId: "900001",
          status: "active",
          termCapabilities: {},
        },
        projectSource: "external_tms",
      },
    ]);
    mocks.searchAttachedCrowdinGlossaryConcordance.mockResolvedValue([
      nativeMatch("crowdin:glossary:718785"),
      nativeMatch("crowdin:glossary:900001"),
    ]);

    const matches = await searchGlossaryConcordance({
      organizationId: "org-1",
      projectId: "ext:crowdin:902807",
      sourceLocale: "en",
      targetLocales: ["fr"],
      sourceText: "Save",
    });

    expect(mocks.createGlossary).not.toHaveBeenCalled();
    expect(mocks.searchAttachedCrowdinGlossaryConcordance).toHaveBeenCalledTimes(1);
    expect(mocks.searchAttachedCrowdinGlossaryConcordance).toHaveBeenCalledWith(
      expect.objectContaining({
        attachedGlossaries: [
          expect.objectContaining({ id: "crowdin:glossary:718785" }),
          expect.objectContaining({ id: "crowdin:glossary:900001" }),
        ],
      }),
    );
    expect(matches).toHaveLength(2);
  });
});

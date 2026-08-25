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

import { mapCrowdinLiveGlossaryPageItem } from "./tms-provider-live";

function glossary(
  overrides: {
    externalGlossaryId?: string;
    externalProjectIds?: string[];
    description?: string | null;
    termCount?: number | null;
    externalUrl?: string | null;
    createdAt?: string | null;
  } = {},
) {
  return {
    externalGlossaryId: overrides.externalGlossaryId ?? "42",
    name: "Product glossary",
    description: overrides.description === undefined ? "Shared terms" : overrides.description,
    sourceLocale: "en",
    targetLocale: "fr",
    localeCoverage: ["en", "fr"],
    termCount: overrides.termCount === undefined ? 12 : overrides.termCount,
    externalUrl:
      overrides.externalUrl === undefined ? "https://crowdin.example/g/42" : overrides.externalUrl,
    externalProjectIds: overrides.externalProjectIds ?? ["100", "200"],
    createdAt: overrides.createdAt === undefined ? null : overrides.createdAt,
  };
}

describe("mapCrowdinLiveGlossaryPageItem", () => {
  it("prefers a linked project that exists in the org project map", () => {
    const mapped = mapCrowdinLiveGlossaryPageItem({
      glossary: glossary({
        externalProjectIds: ["999", "200", "100"],
        createdAt: "2026-02-15T08:30:00.000Z",
      }),
      projectById: new Map([
        ["100", { name: "Website" }],
        ["200", { name: "Mobile" }],
      ]),
    });

    expect(mapped).toMatchObject({
      id: "crowdin:glossary:42",
      providerKind: "crowdin",
      name: "Product glossary",
      description: "Shared terms",
      externalProjectId: "200",
      projectName: "Mobile",
      termCount: 12,
      createdAt: "2026-02-15T08:30:00.000Z",
    });
  });

  it("falls back to the first Crowdin project id when none are linked locally", () => {
    const mapped = mapCrowdinLiveGlossaryPageItem({
      glossary: glossary({
        externalProjectIds: ["777"],
        description: null,
        termCount: null,
        externalUrl: null,
      }),
      projectById: new Map([["100", { name: "Website" }]]),
    });

    expect(mapped).toMatchObject({
      id: "crowdin:glossary:42",
      description: null,
      termCount: null,
      externalUrl: null,
      externalProjectId: "777",
      projectName: null,
    });
  });

  it("returns null when filtering by a project that is not linked to the glossary", () => {
    const mapped = mapCrowdinLiveGlossaryPageItem({
      glossary: glossary({ externalProjectIds: ["100"] }),
      projectById: new Map([["100", { name: "Website" }]]),
      externalProjectId: "200",
    });

    expect(mapped).toBeNull();
  });

  it("keeps a project-filtered glossary when the requested project is linked", () => {
    const mapped = mapCrowdinLiveGlossaryPageItem({
      glossary: glossary({ externalProjectIds: ["100", "200"] }),
      projectById: new Map([
        ["100", { name: "Website" }],
        ["200", { name: "Mobile" }],
      ]),
      externalProjectId: "100",
    });

    expect(mapped).toMatchObject({
      externalProjectId: "100",
      projectName: "Website",
    });
  });
});

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
  glossaryTermFlagsFromStatus,
  normalizedGlossaryTermStatusFromStatus,
} from "@/lib/providers/contracts/glossary-term-status";
import {
  hydrateNativeConceptConcordanceMatches,
  pickPreferredTermForLocale,
} from "@/lib/glossary/concordance-native-concept";
import type { NativeConceptSourceHit } from "@/lib/glossary/concordance-native-concept";
import type { NormalizedGlossaryConceptTerm } from "@/lib/providers/contracts/glossary-match";

describe("glossaryTermFlagsFromStatus", () => {
  it("derives preferred and not-recommended from status only", () => {
    expect(glossaryTermFlagsFromStatus("preferred")).toEqual({
      preferred: true,
      notRecommended: false,
    });
    expect(glossaryTermFlagsFromStatus("not_recommended")).toEqual({
      preferred: false,
      notRecommended: true,
    });
    expect(glossaryTermFlagsFromStatus("admitted")).toEqual({
      preferred: false,
      notRecommended: false,
    });
  });

  it("maps normalizedGlossaryTermStatusFromStatus to runtime flags", () => {
    expect(normalizedGlossaryTermStatusFromStatus("not_recommended")).toEqual({
      forbidden: true,
      preferred: false,
    });
  });
});

describe("pickPreferredTermForLocale", () => {
  const terms: NormalizedGlossaryConceptTerm[] = [
    { id: "1", locale: "fr", text: "draft term", status: "draft" },
    { id: "2", locale: "fr", text: "preferred term", status: "preferred" },
    { id: "3", locale: "fr", text: "admitted term", status: "admitted" },
  ];

  it("prefers preferred status, then admitted, then first available", () => {
    expect(pickPreferredTermForLocale(terms, "fr")?.text).toBe("preferred term");
    expect(
      pickPreferredTermForLocale(
        terms.filter((term) => term.status !== "preferred"),
        "fr",
      )?.text,
    ).toBe("admitted term");
  });
});

describe("hydrateNativeConceptConcordanceMatches", () => {
  it("returns empty matches when no source hits survive filtering", async () => {
    await expect(
      hydrateNativeConceptConcordanceMatches({
        sourceHits: [],
        sourceLocale: "en",
        targetLocales: ["fr"],
        sourceText: "workspace",
        limit: 10,
      }),
    ).resolves.toEqual([]);
  });
});

describe("NativeConceptSourceHit", () => {
  it("type-checks representative hit shape", () => {
    const hit: NativeConceptSourceHit = {
      conceptId: "concept-1",
      glossaryId: "glossary-1",
      glossaryName: "Product",
      matchedSourceTermId: "term-1",
      matchedSourceTerm: "workspace",
      caseSensitive: false,
      sourceStatus: "preferred",
      rank: 0.9,
      externalProviderKind: null,
      externalGlossaryId: null,
      externalGlossaryUrl: null,
    };

    expect(hit.matchedSourceTerm).toBe("workspace");
  });
});

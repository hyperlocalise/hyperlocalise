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
  pickPreferredTermForLocale,
  filterConcordanceTargetTerms,
} from "@/lib/glossary/native-glossary";
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

describe("filterConcordanceTargetTerms", () => {
  const terms: NormalizedGlossaryConceptTerm[] = [
    { id: "en", locale: "en", text: "Save" },
    { id: "fr", locale: "fr", text: "Enregistrer" },
    { id: "de", locale: "de", text: "Speichern" },
    { id: "ja", locale: "ja", text: "保存" },
  ];

  it("keeps only terms in the requested target locales", () => {
    expect(filterConcordanceTargetTerms(terms, ["fr"]).map((term) => term.locale)).toEqual(["fr"]);
    expect(filterConcordanceTargetTerms(terms, ["fr", "ja"]).map((term) => term.locale)).toEqual([
      "fr",
      "ja",
    ]);
  });

  it("returns no target terms when the query requests none", () => {
    expect(filterConcordanceTargetTerms(terms, [])).toEqual([]);
  });
});

describe("NativeGlossary.searchConcordance", () => {
  it("returns empty matches when source text produces no tsquery", async () => {
    const { NativeGlossary } = await import("@/lib/glossary/native-glossary");
    const glossary = new NativeGlossary({
      auth: {
        user: { workosUserId: "", localUserId: "", email: "" },
        organizations: [],
        organization: {
          workosOrganizationId: "",
          localOrganizationId: "org-1",
          name: "",
          membership: { role: "admin", accessSource: "workos_authoritative" },
        },
        activeOrganization: {
          workosOrganizationId: "",
          localOrganizationId: "org-1",
          name: "",
          membership: { role: "admin", accessSource: "workos_authoritative" },
        },
        membership: { role: "admin", accessSource: "workos_authoritative" },
        activeTeam: null,
        capabilities: [],
      },
      glossary: {
        id: "glossary-1",
        source: "native",
        sourceLocale: "en",
      } as never,
    });

    await expect(
      glossary.searchConcordance(
        {
          sourceLocale: "en",
          targetLocales: ["fr"],
          sourceText: "   ",
          limit: 10,
        },
        { organizationId: "org-1", projectId: "project-1" },
      ),
    ).resolves.toEqual([]);
  });
});

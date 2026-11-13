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

import { consolidateEngineSuggestions, snippetAround } from "./consolidate-suggestions";
import { acmeHomePage, acmePricingPage, crawledPageFixture } from "./engine-setup.fixture";
import type { EngineSignalCandidates } from "./extract-engine-signals";
import { buildPageCorpora, PageCorpusIndex } from "./page-corpus";

const index = new PageCorpusIndex(buildPageCorpora([acmeHomePage, acmePricingPage]));
const noExisting = { glossaryTermKeys: new Set<string>(), knowledgeContent: "" };

function candidates(overrides: Partial<EngineSignalCandidates>): EngineSignalCandidates {
  return { terms: [], rules: [], voice: null, ...overrides };
}

function term(overrides: Partial<EngineSignalCandidates["terms"][number]> & { term: string }) {
  return {
    termType: "product" as const,
    translatable: false,
    definition: "",
    confidence: 80,
    evidence: [],
    ...overrides,
  };
}

describe("consolidateEngineSuggestions", () => {
  it("drops terms that do not appear on any crawled page", () => {
    const drafts = consolidateEngineSuggestions({
      candidates: candidates({
        terms: [term({ term: "Flow Studio" }), term({ term: "Hallucinated Pro" })],
      }),
      index,
      existing: noExisting,
    });

    expect(drafts.map((draft) => draft.dedupeKey)).toEqual(["flow studio"]);
  });

  it("scores terms higher when they recur across pages", () => {
    const drafts = consolidateEngineSuggestions({
      candidates: candidates({
        terms: [
          term({ term: "Flow Pro", confidence: 80 }),
          term({ term: "Flow Studio", confidence: 80 }),
        ],
      }),
      index,
      existing: noExisting,
    });

    // Flow Studio is on both pages; Flow Pro only on pricing.
    expect(drafts.map((draft) => [draft.dedupeKey, draft.confidence])).toEqual([
      ["flow studio", 68],
      ["flow pro", 58],
    ]);
  });

  it("keeps only evidence snippets that are really on the cited page", () => {
    const [draft] = consolidateEngineSuggestions({
      candidates: candidates({
        terms: [
          term({
            term: "Flow Studio",
            evidence: [
              { pageIndex: 0, snippet: "Flow Studio lets you review every string" },
              { pageIndex: 1, snippet: "Flow Studio lets you review every string" },
              { pageIndex: 0, snippet: "made-up quote" },
            ],
          }),
        ],
      }),
      index,
      existing: noExisting,
    });

    expect(draft?.evidence).toEqual([
      { url: "https://acme.test/", snippet: "Flow Studio lets you review every string" },
    ]);
  });

  it("falls back to page context when the model cites nothing usable", () => {
    const [draft] = consolidateEngineSuggestions({
      candidates: candidates({ terms: [term({ term: "Flow Pro" })] }),
      index,
      existing: noExisting,
    });

    expect(draft?.evidence).toHaveLength(1);
    expect(draft?.evidence[0]?.url).toBe("https://acme.test/pricing");
    expect(draft?.evidence[0]?.snippet).toContain("Flow Pro includes Flow Studio");
  });

  it("dedupes terms case-insensitively and flags ones already in a glossary", () => {
    const drafts = consolidateEngineSuggestions({
      candidates: candidates({
        terms: [
          term({ term: "acme flow", confidence: 40 }),
          term({ term: "Acme Flow", confidence: 90 }),
        ],
      }),
      index,
      existing: { glossaryTermKeys: new Set(["acme flow"]), knowledgeContent: "" },
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      payload: { kind: "term", term: { term: "Acme Flow" } },
      conflict: "exists_in_glossary",
    });
  });

  it("drops rules without verified evidence and flags rules already in knowledge memory", () => {
    const drafts = consolidateEngineSuggestions({
      candidates: candidates({
        rules: [
          {
            text: 'Address the reader as "you".',
            category: "tone",
            confidence: 85,
            evidence: [{ pageIndex: 0, snippet: "You stay in control." }],
          },
          {
            text: "Use exclamation marks for emphasis.",
            category: "formatting",
            confidence: 90,
            evidence: [{ pageIndex: 0, snippet: "Wow!" }],
          },
        ],
      }),
      index,
      existing: {
        glossaryTermKeys: new Set(),
        knowledgeContent: '## Style rules\n\n- Address the reader as "you".',
      },
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ kind: "rule", conflict: "exists_in_knowledge" });
  });

  it("lowers voice confidence when none of its evidence checks out", () => {
    const voice = {
      summary: "Calm and direct.",
      formality: 40,
      playfulness: 20,
      technicality: 50,
      doSay: ["You stay in control.", "you stay in control."],
      dontSay: [],
      confidence: 70,
      evidence: [{ pageIndex: 0, snippet: "not on the page" }],
    };
    const [draft] = consolidateEngineSuggestions({
      candidates: candidates({ voice }),
      index,
      existing: noExisting,
    });

    expect(draft).toMatchObject({
      kind: "voice",
      dedupeKey: "voice",
      confidence: 50,
      conflict: null,
      payload: { kind: "voice", voice: { doSay: ["You stay in control."] } },
    });
  });

  it("skips pages that failed to load", () => {
    const failed = crawledPageFixture({
      url: "https://acme.test/broken",
      status: 500,
      textSample: "Flow Pro",
    });
    expect(buildPageCorpora([failed])).toEqual([]);
  });
});

describe("snippetAround", () => {
  it("returns surrounding context with ellipses", () => {
    const text = `${"a".repeat(100)} Flow Pro ${"b".repeat(100)}`;
    const snippet = snippetAround(text, "flow pro");
    expect(snippet?.startsWith("…")).toBe(true);
    expect(snippet?.endsWith("…")).toBe(true);
    expect(snippet).toContain("Flow Pro");
  });

  it("returns null when the value is absent", () => {
    expect(snippetAround("nothing here", "Flow Pro")).toBeNull();
  });
});

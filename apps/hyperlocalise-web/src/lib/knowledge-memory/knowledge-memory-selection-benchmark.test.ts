import { describe, expect, it } from "vite-plus/test";

import { KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH } from "./knowledge-memory.shared";
import {
  parseMarkdownMemory,
  selectKnowledgeMemoryContext,
  type SelectKnowledgeMemoryContextInput,
  type SelectedKnowledgeMemoryContext,
} from "./knowledge-memory-selection";

type BenchmarkFixture = {
  name: string;
  input: Omit<SelectKnowledgeMemoryContextInput, "content">;
  expectedHeading: string;
  goldNegativeHeadings?: string[];
};

type FixtureScore = {
  name: string;
  top1Coverage: 0 | 1;
  top3Coverage: 0 | 1;
  irrelevantHits: number;
  top3Count: number;
  reductionPercent: number;
  selectedMemoryChars: number;
  fallbackMode: SelectedKnowledgeMemoryContext["metrics"]["fallbackMode"];
  topHeadings: string[];
};

const benchmarkMemory = [
  "# Memory.md",
  "",
  "## General checkout guidance",
  "",
  "Use short, direct checkout copy for every locale. Do not invent discounts or urgency.",
  "",
  "## Australian English checkout rules",
  "",
  "### en-AU",
  "",
  "Checkout, cart, shipping, and payment copy should use Australian English.",
  "",
  "- Prefer colour, customise, centre, postcode, and basket where retail context allows.",
  "- Avoid US spelling in customer-facing checkout and payment screens.",
  "",
  "## French formal payment voice",
  "",
  "### fr-FR",
  "",
  "Use formal vous phrasing for panier, paiement, purchase confirmation, and checkout steps.",
  "",
  "- Avoid slang in French checkout copy.",
  "- Keep payment failure messages calm and specific.",
  "",
  "## Purchase funnel payment rules",
  "",
  "Use purchase funnel language for cart, payment method, checkout flow, and billing address.",
  "",
  "- Keep payment CTAs direct.",
  "- Do not add marketing flourish to purchase confirmation steps.",
  "",
  "## Protected product tokens",
  "",
  "- Never translate SKU-ALPHA.",
  "- Never translate plan code PRO-LOCAL.",
  "- Keep literal API token names unchanged.",
  "",
  "## Retail UI",
  "",
  "### Labels",
  "",
  "- On cart steps, use basket labels for en-AU and en-GB retail journeys.",
  "- Keep the inherited checkout section context when applying short UI label rules.",
  "",
  "## General brand voice",
  "",
  "Sound practical, precise, and engineering-native.",
  "",
  "- Avoid hype-heavy words such as revolutionary and game-changing.",
  "",
  "## Legal privacy compliance",
  "",
  "Preserve legal, tax, cookie, and privacy disclosure meaning exactly.",
  "",
  "- Do not rewrite legal entity names.",
  "- Do not infer privacy consent copy.",
  "",
  ...Array.from({ length: 90 }, (_, index) =>
    [
      `## Noise section ${index + 1}`,
      "",
      "This operational note is intentionally irrelevant filler for support, onboarding, analytics, incident review, and release process copy.",
      "",
    ].join("\n"),
  ),
].join("\n");

const benchmarkFixtures: BenchmarkFixture[] = [
  {
    name: "exact locale and domain heading in mixed locale doc",
    input: {
      targetLocale: "en-AU",
      sourceText: "Customize the checkout payment screen and color selector",
      context: "Checkout domain copy",
    },
    expectedHeading: "Memory.md > Australian English checkout rules > en-AU",
    goldNegativeHeadings: ["Legal privacy compliance", "General brand voice"],
  },
  {
    name: "synonym paraphrase checkout flow cart payment",
    input: {
      targetLocale: "en-US",
      sourceText: "Checkout flow cart payment failed",
      context: "Payment page microcopy",
    },
    expectedHeading: "Memory.md > Purchase funnel payment rules",
    goldNegativeHeadings: ["Legal privacy compliance", "General brand voice"],
  },
  {
    name: "short query avoids legal and brand noise",
    input: {
      targetLocale: "en-US",
      sourceText: "translate checkout",
    },
    expectedHeading: "Memory.md > General checkout guidance",
    goldNegativeHeadings: [
      "Legal privacy compliance",
      "General brand voice",
      "Protected product tokens",
    ],
  },
  {
    name: "locale specific rule outranks general checkout rule",
    input: {
      targetLocale: "en-AU",
      sourceText: "Add to cart checkout copy",
    },
    expectedHeading: "Memory.md > Australian English checkout rules > en-AU",
    goldNegativeHeadings: ["Legal privacy compliance"],
  },
  {
    name: "negative protected-token rule wins on exact source token",
    input: {
      targetLocale: "de-DE",
      sourceText: "The SKU-ALPHA accessory ships tomorrow",
    },
    expectedHeading: "Memory.md > Protected product tokens",
    goldNegativeHeadings: ["General brand voice", "Legal privacy compliance"],
  },
  {
    name: "weak heading inherits bullet context",
    input: {
      targetLocale: "en-AU",
      sourceText: "Cart label should say basket",
      context: "Retail UI checkout labels",
    },
    expectedHeading: "Memory.md > Retail UI > Labels",
    goldNegativeHeadings: ["Legal privacy compliance"],
  },
  {
    name: "fr-FR prompt in French retrieves French payment guidance",
    input: {
      targetLocale: "fr-FR",
      sourceText: "paiement panier confirmation",
    },
    expectedHeading: "Memory.md > French formal payment voice > fr-FR",
    goldNegativeHeadings: ["Australian English checkout rules", "General brand voice"],
  },
  {
    name: "English prompt variant retrieves French locale guidance",
    input: {
      targetLocale: "fr-FR",
      sourceText: "Complete checkout payment",
      context: "French checkout translation",
    },
    expectedHeading: "Memory.md > French formal payment voice > fr-FR",
    goldNegativeHeadings: ["Australian English checkout rules", "Legal privacy compliance"],
  },
];

function headingMatches(heading: string, expected: string) {
  return heading === expected || heading.includes(expected);
}

function topHeadings(selection: SelectedKnowledgeMemoryContext, count: number) {
  return selection.metrics.matchedHeadingPaths.slice(0, count);
}

function scoreFixture(fixture: BenchmarkFixture): FixtureScore {
  const firstRun = selectKnowledgeMemoryContext({
    content: benchmarkMemory,
    ...fixture.input,
  });
  const secondRun = selectKnowledgeMemoryContext({
    content: benchmarkMemory,
    ...fixture.input,
  });

  expect(secondRun.metrics.matchedHeadingPaths).toEqual(firstRun.metrics.matchedHeadingPaths);
  expect(secondRun.compactText).toBe(firstRun.compactText);

  const top1 = topHeadings(firstRun, 1);
  const top3 = topHeadings(firstRun, 3);
  const negativeHeadings = fixture.goldNegativeHeadings ?? [];
  const irrelevantHits = top3.filter((heading) =>
    negativeHeadings.some((negativeHeading) => headingMatches(heading, negativeHeading)),
  ).length;

  return {
    name: fixture.name,
    top1Coverage: top1.some((heading) => headingMatches(heading, fixture.expectedHeading)) ? 1 : 0,
    top3Coverage: top3.some((heading) => headingMatches(heading, fixture.expectedHeading)) ? 1 : 0,
    irrelevantHits,
    top3Count: top3.length,
    reductionPercent: firstRun.metrics.reductionPercent,
    selectedMemoryChars: firstRun.metrics.selectedMemoryChars,
    fallbackMode: firstRun.metrics.fallbackMode,
    topHeadings: top3,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(scores: FixtureScore[]) {
  const irrelevantHits = scores.reduce((sum, score) => sum + score.irrelevantHits, 0);
  const top3Count = scores.reduce((sum, score) => sum + score.top3Count, 0);

  return {
    top1Coverage: Number(average(scores.map((score) => score.top1Coverage)).toFixed(2)),
    top3Coverage: Number(average(scores.map((score) => score.top3Coverage)).toFixed(2)),
    irrelevantHitRate: Number((irrelevantHits / Math.max(1, top3Count)).toFixed(2)),
    maxSelectedMemoryChars: Math.max(...scores.map((score) => score.selectedMemoryChars)),
    minReductionPercent: Math.min(...scores.map((score) => score.reductionPercent)),
  };
}

function tokenizeForFtsLikeBaseline(value: string) {
  return value
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\u2019/g, "")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function ftsLikeTopHeadings(fixture: BenchmarkFixture) {
  const queryTokens = new Set(
    tokenizeForFtsLikeBaseline(
      [
        fixture.input.targetLocale,
        fixture.input.sourceLocale,
        fixture.input.sourceText,
        fixture.input.context,
        fixture.input.key,
        fixture.input.path,
        fixture.input.projectName,
        fixture.input.projectTranslationContext,
        ...(fixture.input.targetLocales ?? []),
        ...Object.values(fixture.input.metadata ?? {}),
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );

  return parseMarkdownMemory(benchmarkMemory)
    .map((segment) => {
      const segmentTokens = new Set(
        tokenizeForFtsLikeBaseline([segment.headingPath.join(" "), segment.segmentText].join(" ")),
      );
      let score = 0;
      for (const token of queryTokens) {
        if (segmentTokens.has(token)) {
          score += 1;
        }
      }
      return {
        heading: segment.headingPath.join(" > "),
        startOffset: segment.startOffset,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.startOffset - b.startOffset;
    })
    .slice(0, 3)
    .map((item) => item.heading);
}

describe("knowledge memory lexical retrieval benchmark", () => {
  it("meets MVP coverage, precision, reduction, and determinism thresholds", () => {
    const scores = benchmarkFixtures.map(scoreFixture);
    const summary = summarize(scores);

    console.info("knowledge-memory lexical benchmark", JSON.stringify({ summary, scores }));

    expect(summary.top1Coverage).toBeGreaterThanOrEqual(0.75);
    expect(summary.top3Coverage).toBeGreaterThanOrEqual(0.9);
    expect(summary.irrelevantHitRate).toBeLessThanOrEqual(0.1);
    expect(summary.maxSelectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
    expect(scores.every((score) => score.fallbackMode === "selective")).toBe(true);
  });

  it("documents the current lexical selector against a simple FTS-like baseline", () => {
    const lexicalScores = benchmarkFixtures.map(scoreFixture);
    const ftsLikeScores = benchmarkFixtures.map((fixture) => {
      const headings = ftsLikeTopHeadings(fixture);
      return {
        name: fixture.name,
        top1Coverage: headings
          .slice(0, 1)
          .some((heading) => headingMatches(heading, fixture.expectedHeading))
          ? 1
          : 0,
        top3Coverage: headings.some((heading) => headingMatches(heading, fixture.expectedHeading))
          ? 1
          : 0,
        topHeadings: headings,
      };
    });

    const lexicalSummary = summarize(lexicalScores);
    const ftsLikeSummary = {
      top1Coverage: Number(average(ftsLikeScores.map((score) => score.top1Coverage)).toFixed(2)),
      top3Coverage: Number(average(ftsLikeScores.map((score) => score.top3Coverage)).toFixed(2)),
    };

    console.info(
      "knowledge-memory retrieval comparison",
      JSON.stringify({ lexicalSummary, ftsLikeSummary, ftsLikeScores }),
    );

    expect(lexicalSummary.top1Coverage).toBeGreaterThanOrEqual(ftsLikeSummary.top1Coverage);
    expect(lexicalSummary.top3Coverage).toBeGreaterThanOrEqual(ftsLikeSummary.top3Coverage);
  });
});

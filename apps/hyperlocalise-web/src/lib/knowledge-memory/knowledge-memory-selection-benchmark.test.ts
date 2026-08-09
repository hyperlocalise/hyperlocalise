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

import { KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH } from "./knowledge-memory.shared";
import {
  parseMarkdownMemory,
  selectKnowledgeMemoryContext,
  type SelectKnowledgeMemoryContextInput,
  type SelectedKnowledgeMemoryContext,
} from "./knowledge-memory-selection";

type BenchmarkFixture = {
  name: string;
  content?: string;
  input: Omit<SelectKnowledgeMemoryContextInput, "content">;
  expectedHeading: string;
  goldPositiveHeadings?: string[];
  goldNegativeHeadings?: string[];
  requiredSelectedHeadings?: string[];
  /**
   * Substrings that must appear in the final `compactText`, not just in a matched heading.
   * Ranking a segment correctly (top1/top3 coverage) says nothing about whether the specific
   * rule text inside that segment survived the selector's per-segment truncation — this closes
   * that gap.
   */
  requiredSelectedText?: string[];
};

type FixtureScore = {
  name: string;
  top1Coverage: 0 | 1;
  top3Coverage: 0 | 1;
  requiredHeadingCoverage: 0 | 1;
  requiredTextCoverage: 0 | 1;
  irrelevantSelectedCount: number;
  top3Count: number;
  reductionPercent: number;
  selectedMemoryChars: number;
  fallbackMode: SelectedKnowledgeMemoryContext["metrics"]["fallbackMode"];
  fallbackTriggered: boolean;
  selectedHeadingPaths: string[];
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

const structuralRobustnessMemory = [
  "# Memory.md",
  "",
  "## Broken but readable",
  "### fr-FR ###",
  "1) Keep panier checkout payment confirmations formal for fr-FR.",
  "2) Prefer vous in payment failure and confirmation errors.",
  "",
  "### [Odd heading",
  "- This malformed-looking heading should still parse as a local section.",
  "",
  "## Legal privacy compliance",
  "Preserve legal, tax, cookie, and privacy disclosure meaning exactly.",
  "",
  ...Array.from({ length: 100 }, (_, index) =>
    [
      `## Noisy malformed section ${index + 1}`,
      `- Repeated filler with support, analytics, release, operations, and onboarding words ${index + 1}.`,
      "",
    ].join("\n"),
  ),
].join("\n");

// Regression fixtures for the compactPromptText prefix-truncation bug: a segment can rank
// correctly (top1/top3 coverage) while the specific rule text inside it is silently dropped
// because only the first ~900 characters of the segment ever reached the final prompt.
const truncationFillerSentence =
  "This sentence is unrelated filler prose added only to push the paragraph well past the selector's per-segment character budget. ";

const longFormCheckoutParagraph = [
  "This paragraph intentionally bundles several distinct checkout rules into one continuous block of prose so retrieval must excerpt the sentence that actually matches instead of only ever keeping the first slice of text.",
  "At the very start of this note the gridwidget component must remain left aligned on every step across all locales, because early usability testing showed right alignment caused repeated mis-taps on mobile.",
  truncationFillerSentence.repeat(6),
  "Roughly in the middle of this same paragraph the confirmpanel must always display the order total above the shipping address on every confirmation screen, since customers reported confusion when totals appeared last.",
  truncationFillerSentence.repeat(6),
  "Near the very end of this paragraph the shippingflag status indicator must stay visible throughout the entire flow, including on any error or retry screen, so shoppers can always see it.",
].join(" ");

const protectedFulfillmentTokensList = [
  "Keep every internal system identifier exactly as written across every locale and never localise, transliterate, or adjust the punctuation immediately surrounding them in customer-facing or internal copy.",
  "Fulfillment identifiers are consumed programmatically by downstream warehouse and logistics systems and must never be reworded, abbreviated, or expanded even when the surrounding sentence is rewritten for style.",
  "Treat any code containing a hyphen, slash, or mixed capitalisation as a literal opaque token regardless of the surrounding sentence casing, tense, or grammatical number in the target locale.",
  "Do not add articles such as the, a, or an directly in front of internal system identifiers in any locale, since doing so has historically confused automated log-parsing tooling.",
  "Do not pluralise, hyphenate, or otherwise inflect internal system identifiers even when the surrounding sentence describing them is grammatically plural in the target language.",
  "Preserve the original capitalisation of internal system identifiers exactly as authored in the source document, including any deliberately inconsistent internal casing conventions.",
  "Never translate the routingtoken internal code because the fulfillment system reads it directly and any translated variant will silently break automated shipment routing.",
];

const punctuationFreeIdentifierBlock =
  Array.from(
    { length: 16 },
    (_, index) =>
      `identifierBatch${index + 1} inventorySync releaseGate warehouseNode shipmentQueue`,
  ).join(" ") + " nopunctailmarker resolvesInventoryDrift";

const truncationRegressionMemory = [
  "# Memory.md",
  "",
  "## Long-form checkout paragraph",
  "",
  longFormCheckoutParagraph,
  "",
  "## Protected fulfillment tokens",
  "",
  ...protectedFulfillmentTokensList.map((line) => `- ${line}`),
  "",
  "## Punctuation-free identifier block",
  "",
  punctuationFreeIdentifierBlock,
  "",
].join("\n");

const multiLocaleShortRuleFor = (locale: string) =>
  [
    `## ${locale} payment rule`,
    "",
    `### ${locale}`,
    "",
    `Use formal, locale-appropriate payment confirmation wording for ${locale}.`,
    "",
  ].join("\n");

const longEnAuConfirmationParagraph = [
  "This paragraph documents Australian retail checkout confirmation wording in extended detail so the selector's tighter multi-locale budget must be spent on the sentence that actually matches the query.",
  truncationFillerSentence.repeat(30),
  "Near the very end of this en-AU confirmation guidance, the auconfirmtoken confirmation banner must always show the estimated delivery window immediately below the order total on the confirmation screen.",
].join(" ");

const multiLocaleTruncationMemory = [
  "# Memory.md",
  "",
  ...["fr-FR", "de-DE", "es-ES", "it-IT", "pt-PT", "ja-JP"].map(multiLocaleShortRuleFor),
  "## en-AU confirmation guidance",
  "",
  "### en-AU",
  "",
  longEnAuConfirmationParagraph,
  "",
].join("\n");

const asymmetricMultiLocaleMemory = [
  "# Memory.md",
  "",
  ...Array.from({ length: 6 }, (_, index) =>
    [
      `## French payment rule ${index + 1}`,
      "",
      "### fr-FR",
      "",
      `Use formal French checkout payment wording for case ${index + 1}.`,
      "",
    ].join("\n"),
  ),
  "## Australian English",
  "",
  "### en-AU",
  "",
  "Use colour, customise, postcode, and basket.",
  "",
  "## Padding",
  "",
  "x".repeat(2_500),
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
    goldPositiveHeadings: [
      "Memory.md > Purchase funnel payment rules",
      "Memory.md > Retail UI > Labels",
    ],
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
    goldPositiveHeadings: [
      "Memory.md > Australian English checkout rules > en-AU",
      "Memory.md > General checkout guidance",
    ],
    goldNegativeHeadings: ["Legal privacy compliance", "General brand voice"],
  },
  {
    name: "short query avoids legal and brand noise",
    input: {
      targetLocale: "en-US",
      sourceText: "translate checkout",
    },
    expectedHeading: "Memory.md > General checkout guidance",
    goldPositiveHeadings: [
      "Memory.md > Australian English checkout rules > en-AU",
      "Memory.md > Purchase funnel payment rules",
    ],
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
    goldPositiveHeadings: [
      "Memory.md > Retail UI > Labels",
      "Memory.md > Purchase funnel payment rules",
      "Memory.md > General checkout guidance",
    ],
    goldNegativeHeadings: ["Legal privacy compliance"],
    requiredSelectedText: ["colour", "customise"],
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
    goldPositiveHeadings: [
      "Memory.md > Australian English checkout rules > en-AU",
      "Memory.md > Purchase funnel payment rules",
    ],
    goldNegativeHeadings: ["Legal privacy compliance"],
  },
  {
    name: "fr-FR prompt in French retrieves French payment guidance",
    input: {
      targetLocale: "fr-FR",
      sourceText: "paiement panier confirmation",
    },
    expectedHeading: "Memory.md > French formal payment voice > fr-FR",
    goldPositiveHeadings: ["Memory.md > Purchase funnel payment rules"],
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
    goldPositiveHeadings: ["Memory.md > Purchase funnel payment rules"],
    goldNegativeHeadings: ["Australian English checkout rules", "Legal privacy compliance"],
  },
  {
    name: "structural robustness keeps odd markdown boundaries retrievable",
    content: structuralRobustnessMemory,
    input: {
      targetLocale: "fr-FR",
      sourceText: "paiement checkout confirmation vous",
    },
    expectedHeading: "Memory.md > Broken but readable > fr-FR",
    goldNegativeHeadings: ["Legal privacy compliance", "Noisy malformed section"],
  },
  {
    name: "asymmetric multi-target locale coverage",
    content: asymmetricMultiLocaleMemory,
    input: {
      targetLocales: ["fr-FR", "en-AU"],
      sourceText: "Checkout payment confirmation",
    },
    expectedHeading: "Memory.md > French payment rule 1 > fr-FR",
    goldPositiveHeadings: [
      "Memory.md > French payment rule",
      "Memory.md > Australian English > en-AU",
    ],
    goldNegativeHeadings: ["Memory.md > Padding"],
    requiredSelectedHeadings: [
      "Memory.md > French payment rule",
      "Memory.md > Australian English > en-AU",
    ],
  },
  {
    name: "truncation regression: rule at the beginning of a long paragraph survives",
    content: truncationRegressionMemory,
    input: {
      targetLocale: "en-US",
      sourceText: "gridwidget alignment behaviour mobile",
    },
    expectedHeading: "Memory.md > Long-form checkout paragraph",
    requiredSelectedText: ["gridwidget"],
  },
  {
    name: "truncation regression: rule in the middle of a long paragraph survives",
    content: truncationRegressionMemory,
    input: {
      targetLocale: "en-US",
      sourceText: "confirmpanel total placement screen",
    },
    expectedHeading: "Memory.md > Long-form checkout paragraph",
    requiredSelectedText: ["confirmpanel"],
  },
  {
    name: "truncation regression: rule at the tail of a long paragraph survives",
    content: truncationRegressionMemory,
    input: {
      targetLocale: "en-US",
      sourceText: "shippingflag status indicator visibility",
    },
    expectedHeading: "Memory.md > Long-form checkout paragraph",
    requiredSelectedText: ["shippingflag"],
  },
  {
    name: "truncation regression: negation rule for a protected token survives at the tail of a bullet group",
    content: truncationRegressionMemory,
    input: {
      targetLocale: "de-DE",
      sourceText: "routingtoken warehouse fulfillment identifier",
    },
    expectedHeading: "Memory.md > Protected fulfillment tokens",
    requiredSelectedText: ["routingtoken"],
  },
  {
    name: "truncation regression: punctuation-free oversized text preserves its tail marker",
    content: truncationRegressionMemory,
    input: {
      targetLocale: "en-US",
      sourceText: "nopunctailmarker resolvesInventoryDrift",
    },
    expectedHeading: "Memory.md > Punctuation-free identifier block",
    requiredSelectedText: ["nopunctailmarker"],
  },
  {
    name: "truncation regression: tail rule survives the tighter multi-locale per-segment budget",
    content: multiLocaleTruncationMemory,
    input: {
      targetLocales: ["fr-FR", "de-DE", "es-ES", "it-IT", "pt-PT", "ja-JP", "en-AU"],
      sourceText: "auconfirmtoken delivery window confirmation banner",
    },
    expectedHeading: "Memory.md > en-AU confirmation guidance > en-AU",
    goldPositiveHeadings: [
      "Memory.md > fr-FR payment rule",
      "Memory.md > de-DE payment rule",
      "Memory.md > es-ES payment rule",
      "Memory.md > it-IT payment rule",
      "Memory.md > pt-PT payment rule",
      "Memory.md > ja-JP payment rule",
    ],
    requiredSelectedText: ["auconfirmtoken"],
  },
];

function headingMatches(heading: string, expected: string) {
  return heading === expected || heading.includes(expected);
}

function topHeadings(selection: SelectedKnowledgeMemoryContext, count: number) {
  return selection.metrics.matchedHeadingPaths.slice(0, count);
}

function scoreFixture(fixture: BenchmarkFixture): FixtureScore {
  const content = fixture.content ?? benchmarkMemory;
  const firstRun = selectKnowledgeMemoryContext({
    content,
    ...fixture.input,
  });
  const secondRun = selectKnowledgeMemoryContext({
    content,
    ...fixture.input,
  });

  expect(secondRun.metrics.matchedHeadingPaths).toEqual(firstRun.metrics.matchedHeadingPaths);
  expect(secondRun.compactText).toBe(firstRun.compactText);

  const top1 = topHeadings(firstRun, 1);
  const top3 = topHeadings(firstRun, 3);
  const positiveHeadings = [fixture.expectedHeading, ...(fixture.goldPositiveHeadings ?? [])];
  const negativeHeadings = fixture.goldNegativeHeadings ?? [];
  const irrelevantSelectedCount = top3.filter((heading) => {
    const isPositive = positiveHeadings.some((positiveHeading) =>
      headingMatches(heading, positiveHeading),
    );
    const isNegative = negativeHeadings.some((negativeHeading) =>
      headingMatches(heading, negativeHeading),
    );
    return isNegative || !isPositive;
  }).length;
  const selectedHeadingPaths = firstRun.metrics.matchedHeadingPaths;
  const requiredSelectedHeadings = fixture.requiredSelectedHeadings ?? [fixture.expectedHeading];
  const requiredSelectedText = fixture.requiredSelectedText ?? [];

  return {
    name: fixture.name,
    top1Coverage: top1.some((heading) => headingMatches(heading, fixture.expectedHeading)) ? 1 : 0,
    top3Coverage: top3.some((heading) => headingMatches(heading, fixture.expectedHeading)) ? 1 : 0,
    requiredHeadingCoverage: requiredSelectedHeadings.every((requiredHeading) =>
      selectedHeadingPaths.some((heading) => headingMatches(heading, requiredHeading)),
    )
      ? 1
      : 0,
    requiredTextCoverage: requiredSelectedText.every((text) => firstRun.compactText.includes(text))
      ? 1
      : 0,
    irrelevantSelectedCount,
    top3Count: top3.length,
    reductionPercent: firstRun.metrics.reductionPercent,
    selectedMemoryChars: firstRun.metrics.selectedMemoryChars,
    fallbackMode: firstRun.metrics.fallbackMode,
    fallbackTriggered: firstRun.metrics.fallbackMode !== "selective",
    selectedHeadingPaths,
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
  const irrelevantSelectedCount = scores.reduce(
    (sum, score) => sum + score.irrelevantSelectedCount,
    0,
  );
  const top3Count = scores.reduce((sum, score) => sum + score.top3Count, 0);

  return {
    top1Coverage: Number(average(scores.map((score) => score.top1Coverage)).toFixed(2)),
    top3Coverage: Number(average(scores.map((score) => score.top3Coverage)).toFixed(2)),
    requiredHeadingCoverage: Number(
      average(scores.map((score) => score.requiredHeadingCoverage)).toFixed(2),
    ),
    requiredTextCoverage: Number(
      average(scores.map((score) => score.requiredTextCoverage)).toFixed(2),
    ),
    irrelevantHitRate: Number((irrelevantSelectedCount / Math.max(1, top3Count)).toFixed(2)),
    maxSelectedMemoryChars: Math.max(...scores.map((score) => score.selectedMemoryChars)),
    minReductionPercent: Math.min(...scores.map((score) => score.reductionPercent)),
    fallbackTriggeredCount: scores.filter((score) => score.fallbackTriggered).length,
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

  return parseMarkdownMemory(fixture.content ?? benchmarkMemory)
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
    expect(summary.requiredHeadingCoverage).toBe(1);
    expect(summary.requiredTextCoverage).toBe(1);
    expect(summary.irrelevantHitRate).toBeLessThanOrEqual(0.1);
    expect(summary.fallbackTriggeredCount).toBe(0);
    expect(summary.maxSelectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
    expect(scores.every((score) => score.fallbackMode === "selective")).toBe(true);
  });

  it("does not select protected-token guidance when the protected token is absent", () => {
    const selected = selectKnowledgeMemoryContext({
      content: benchmarkMemory,
      targetLocale: "de-DE",
      sourceText: "Translate checkout accessory shipping copy",
    });

    expect(selected.metrics.matchedHeadingPaths).not.toContain(
      "Memory.md > Protected product tokens",
    );
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

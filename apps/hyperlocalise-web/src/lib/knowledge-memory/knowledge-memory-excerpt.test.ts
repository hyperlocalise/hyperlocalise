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

import { buildSegmentExcerpt } from "./knowledge-memory-excerpt";
import { expandKnowledgeMemoryTokens } from "./knowledge-memory-lexical-retriever";
import type { KnowledgeMemorySegment } from "./knowledge-memory-selection.types";

function segment(overrides: Partial<KnowledgeMemorySegment> & { segmentText: string }) {
  const headingPath = overrides.headingPath ?? ["Memory.md", "Section"];
  const compactPromptText =
    overrides.compactPromptText ??
    `${headingPath.join(" > ")} -> ${overrides.segmentText.slice(0, 40)}`;

  const base: KnowledgeMemorySegment = {
    id: "segment-1",
    kind: "paragraph",
    headingPath,
    segmentText: overrides.segmentText,
    parentSectionPreview: null,
    previousNeighbourText: null,
    nextNeighbourText: null,
    startLine: 1,
    endLine: 1,
    startOffset: 0,
    endOffset: overrides.segmentText.length,
    searchText: overrides.segmentText,
    compactPromptText,
  };

  return { ...base, ...overrides };
}

function tokens(...values: string[]) {
  return expandKnowledgeMemoryTokens(values.join(" "));
}

describe("buildSegmentExcerpt", () => {
  it("picks the matching sentence out of a paragraph regardless of its position", () => {
    const longParagraph = [
      "The alignmentwidget must stay left aligned on every checkout step across every locale.",
      "This is unrelated filler prose about generic checkout localisation practices repeated to add length.".repeat(
        8,
      ),
      "The confirmpanel must always show the order total above the shipping address on the screen.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: longParagraph, kind: "paragraph" }),
      queryTokens: tokens("confirmpanel"),
      maxChars: 200,
    });

    expect(excerpt).toContain("confirmpanel");
    expect(excerpt).not.toContain("alignmentwidget");
  });

  it("emits multiple matching bullets in original document order, not score order", () => {
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- Keep the firstmarker token unchanged in every locale.",
        "- This bullet is unrelated filler about shipping timelines.",
        "- Keep the secondmarker token unchanged and never pluralise it.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("secondmarker", "firstmarker"),
      maxChars: 1000,
    });

    const firstIndex = excerpt.indexOf("firstmarker");
    const secondIndex = excerpt.indexOf("secondmarker");
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it("falls back to the precomputed prefix preview when nothing in the segment text matches", () => {
    const fallbackSegment = segment({
      segmentText: "Some unrelated body text that shares no vocabulary with the query at all.",
      compactPromptText: "Memory.md > Section -> Some unrelated body text preview",
    });

    const excerpt = buildSegmentExcerpt({
      segment: fallbackSegment,
      queryTokens: tokens("nomatchingtoken"),
      maxChars: 1000,
    });

    expect(excerpt).toBe(fallbackSegment.compactPromptText);
  });

  it("uses fallbackMaxChars for the no-match preview when the caller opts in", () => {
    // Regression for a Codex finding: knowledge-memory-selection.ts can call this with maxChars
    // already divided down for balancing across several selected segments. That's the right budget
    // for the match-centering paths below (an oversized inner truncation there would just get
    // corrupted by a second outer trim), but this fallback never centers on anything — it's always
    // a plain prefix cut — so pre-shrinking it can only remove guidance from the end of a preview
    // that would otherwise fit. selection.ts passes fallbackMaxChars only when there's no genuine
    // balanced share to respect (maxSegmentChars was undefined); when a caller does pass it, this
    // fallback should use it instead of the smaller maxChars.
    const longPreview =
      "Memory.md > Section -> " +
      "Generic opening context repeated here to push the preview well past a small balancing " +
      "budget so it needs truncating at all. ".repeat(3) +
      "IMPORTANT_TAIL_GUIDANCE must never be dropped from the end of this preview.";
    const fallbackSegment = segment({
      segmentText: "Some unrelated body text that shares no vocabulary with the query at all.",
      compactPromptText: longPreview,
    });

    const excerpt = buildSegmentExcerpt({
      segment: fallbackSegment,
      queryTokens: tokens("nomatchingtoken"),
      maxChars: 100,
      fallbackMaxChars: 900,
    });

    expect(excerpt).toContain("IMPORTANT_TAIL_GUIDANCE");
  });

  it("still respects maxChars for the no-match preview when fallbackMaxChars isn't given", () => {
    // Companion to the test above: a caller with a genuine balanced share to respect (e.g.
    // multiple fallback/general-mode segments sharing one budget) must not have this fallback
    // silently balloon past that share — omitting fallbackMaxChars keeps the old maxChars-bound
    // behavior, so an over-budget fallback segment still gets truncated (or, at the outer
    // appendWithinBudget step in selection.ts, dropped) rather than exceeding its intended slice
    // of a budget shared with other segments.
    const longPreview =
      "Memory.md > Section -> " +
      "Generic opening context repeated here to push the preview well past a small balancing " +
      "budget so it needs truncating at all. ".repeat(3) +
      "IMPORTANT_TAIL_GUIDANCE must never be dropped from the end of this preview.";
    const fallbackSegment = segment({
      segmentText: "Some unrelated body text that shares no vocabulary with the query at all.",
      compactPromptText: longPreview,
    });

    const excerpt = buildSegmentExcerpt({
      segment: fallbackSegment,
      queryTokens: tokens("nomatchingtoken"),
      maxChars: 100,
    });

    expect(excerpt.length).toBeLessThanOrEqual(100);
    expect(excerpt).not.toContain("IMPORTANT_TAIL_GUIDANCE");
  });

  it("falls back to the prefix preview when queryTokens is empty", () => {
    const fallbackSegment = segment({
      segmentText: "Body text that would otherwise match a query.",
      compactPromptText: "Memory.md > Section -> Body text preview",
    });

    const excerpt = buildSegmentExcerpt({
      segment: fallbackSegment,
      queryTokens: new Set(),
      maxChars: 1000,
    });

    expect(excerpt).toBe(fallbackSegment.compactPromptText);
  });

  it("respects the character budget even when a match is found", () => {
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: Array.from(
        { length: 20 },
        (_, index) => `- Padding bullet number ${index + 1} about generic checkout wording.`,
      )
        .concat("- Keep the targetmarker token unchanged in every locale and never translate it.")
        .join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("targetmarker"),
      maxChars: 120,
    });

    expect(excerpt.length).toBeLessThanOrEqual(120);
    expect(excerpt).toContain("targetmarker");
  });

  it("hard-truncates a single oversized matching unit rather than dropping it", () => {
    const longSentence =
      "The onlymarker token must remain exactly as written across every single locale and screen and must never be reworded, abbreviated, translated, or otherwise altered by any translator or automated tool under any circumstances whatsoever.";

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: longSentence }),
      queryTokens: tokens("onlymarker"),
      maxChars: 80,
    });

    expect(excerpt.length).toBeLessThanOrEqual(80);
    expect(excerpt).toContain("onlymarker");
  });

  it("chunks a punctuation-free oversized unit by words instead of returning it whole", () => {
    const punctuationFree =
      Array.from(
        { length: 20 },
        (_, index) => `identifierBatch${index + 1} inventorySync releaseGate`,
      ).join(" ") + " tailmarker resolvesInventoryDrift";

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: punctuationFree }),
      queryTokens: tokens("tailmarker"),
      maxChars: 200,
    });

    expect(excerpt).toContain("tailmarker");
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });

  it("includes the adjacent unit for a rule split across a condition and its action", () => {
    const paragraph = [
      "When the source text contains a discountcode marker, treat it as a promotional string.",
      "Always apply the promostyling guide to that label regardless of locale.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("discountcode"),
      maxChars: 200,
    });

    expect(excerpt).toContain("discountcode");
    expect(excerpt).toContain("promostyling");
  });

  it("keeps the highest-ranked oversized match instead of a smaller weaker one that fits", () => {
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- Keep the onlysmallword token unchanged and mention extramarker here.",
        "- The bigmarker rule applies broadly and also involves extramarker handling across every locale and screen, with a great deal of additional padding text included here purely to push this bullet's total length well past what fits inside a tight one hundred and twenty character budget window used for this test.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("bigmarker", "extramarker"),
      maxChars: 120,
    });

    expect(excerpt).toContain("bigmarker");
    expect(excerpt).not.toContain("onlysmallword");
  });

  it("favors a discriminative rule match over a generic term that matches several bullets", () => {
    // Regression for a Codex finding: raw integer scoring gave the generic "commonword" term the
    // same weight per match as the specific "tailmarker" term. With "commonword" appearing in two
    // bullets and "tailmarker" in one, the old flat scoring left all three bullets tied at 1, and
    // ties broke by document order — the oversized, commonword-only bullet won and hid the
    // tailmarker rule entirely. Weighting by 1/(matching unit count) makes "tailmarker" (rarer,
    // more discriminative) outscore either "commonword" bullet.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- The commonword flow must render every step in order across every locale and screen for every commonword session, with substantial padding here to push this bullet's length well past what a tight budget window can hold in this test.",
        "- The commonword should always show the order total above the shipping address.",
        "- Never translate the tailmarker identifier.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("commonword", "tailmarker"),
      maxChars: 120,
    });

    expect(excerpt).toContain("tailmarker");
  });

  it("doesn't let a spelling-variant pair double-count a single literal word", () => {
    // Regression for a Codex finding: a unit's expanded token set can contain both a literal word
    // and its synthesized spelling variant ("colour" added alongside a literal "color") even
    // though only one of them actually occurs in the text. Summing both as independent evidence
    // let a bullet with one generic word (scoring 2) outrank a bullet with one genuinely rare,
    // protected identifier (scoring 1) for the same amount of real evidence — even though the
    // protected identifier's bullet comes first in the document — dropping it under a tight budget.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- Never modify protectedtoken during processing under any circumstances whatsoever here today for compliance purposes across every locale and screen.",
        "- Keep color consistent across every screen and locale for every single session recorded today.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("color", "protectedtoken"),
      maxChars: 60,
    });

    expect(excerpt).toContain("protectedtoken");
  });

  it("scores many units against many query tokens without quadratic blowup", () => {
    // Regression for a Codex finding: unit text used to be re-tokenized once per query token
    // (inside computeTokenWeights) and again per unit (inside scoreUnit), making this
    // O(query tokens x units x unit length). The preview API allows sourceText up to 100,000
    // characters, so a large translation request can easily produce thousands of query tokens
    // against a memory with hundreds of bullets; that made a single segment take tens of seconds.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: Array.from(
        { length: 1000 },
        (_, index) => `- Padding bullet number ${index} about generic checkout wording.`,
      ).join("\n"),
    });
    const manyQueryTokens = tokens(
      ...Array.from({ length: 8000 }, (_, index) => `querytoken${index}`),
    );

    const start = performance.now();
    buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: manyQueryTokens,
      maxChars: 500,
    });
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(3000);
  });

  it("packs hundreds of matching ranked units without quadratic blowup", () => {
    // Regression risk introduced alongside the share-allocation fix above: computing each unit's
    // own share reservation now needs to know how much every *other* still-to-come unit needs.
    // Rescanning every remaining unit's text on every single unit's turn would make this
    // O(ranked units²) matchAll scans — unlike the previous test, this one's query token actually
    // matches every bullet, so every one of the 500 bullets ends up in packUnitsWithinBudget's
    // rankedUnits array, not filtered out by an empty ranked list before that code even runs.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: Array.from(
        { length: 500 },
        (_, index) => `- Bullet number ${index} mentions checkout wording explicitly.`,
      ).join("\n"),
    });

    const start = performance.now();
    buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("checkout"),
      maxChars: 500,
    });
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(2000);
  });

  it("centers an oversized unit around many query tokens without quadratic blowup", () => {
    // Regression for a Codex finding: findBestMatchOffset scanned the oversized unit's text once
    // per query token (constructing and running a fresh regex each time), making it O(query tokens
    // x text length) on top of the fix that made rankMatchingUnits itself linear. A single
    // oversized unit under a tight budget with thousands of query tokens took multiple seconds.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: `- ${"padding word ".repeat(2000)}tailmarker`,
    });
    const manyQueryTokens = tokens(
      ...Array.from({ length: 3000 }, (_, index) => `querytoken${index}`),
      "tailmarker",
    );

    const start = performance.now();
    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: manyQueryTokens,
      maxChars: 100,
    });
    const elapsedMs = performance.now() - start;

    expect(excerpt).toContain("tailmarker");
    expect(elapsedMs).toBeLessThan(2000);
  });

  it("keeps a short ranked match alongside a truncated oversized top match", () => {
    // Regression for a Codex finding: the oversized-topMatch branch used to return immediately,
    // bypassing packing entirely and dropping every other ranked unit — even a short one that
    // would fit alongside a truncated fragment of the top match. An oversized "alphamarker" bullet
    // followed by a short "betamarker" rule emitted only the alpha excerpt.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- alphamarker rule applies broadly across every single translation workflow and screen " +
          "state regardless of locale or context, with a great deal of additional identifying " +
          "padding text appended here purely to exceed the budget for this test scenario.",
        "- Never translate the betamarker identifier.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("alphamarker", "betamarker"),
      maxChars: 113,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("still keeps the top match when too many ranked units drive the fair share below usefulness", () => {
    // Regression for a Codex finding: with enough ranked units all matching the same common
    // token, splitting the budget evenly can drive every unit's share under the 12-char truncation
    // floor, rejecting all of them and returning nothing but the heading — even though a truncated
    // top match alone would easily have fit within the full budget.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: Array.from(
        { length: 6 },
        (_, index) => `- Checkout bullet number ${index + 1} about generic wording here today.`,
      ).join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("checkout"),
      maxChars: 103,
    });

    expect(excerpt).toContain("Checkout");
    expect(excerpt.length).toBeGreaterThan("Memory.md > Section -> ".length);
  });

  it("keeps a second discriminative match even when a long shared-token tail follows it", () => {
    // Regression for a Codex finding: reserving every remaining ranked unit's own need in full —
    // regardless of whether the budget could ever satisfy all of them — could zero out a
    // legitimately-ranked match's share whenever many low-value common-token units happened to
    // follow it, even though its own need was tiny and easily affordable by itself. Querying for
    // two discriminative markers plus a common word many filler bullets share used to keep the
    // first marker and several late fillers while dropping the second marker entirely.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- alphamarker rule one.",
        "- betamarker rule two.",
        ...Array.from(
          { length: 20 },
          (_, index) => `- Filler bullet ${index} about generic checkout wording here today.`,
        ),
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("alphamarker", "betamarker", "checkout"),
      maxChars: 150,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("redistributes a short unit's unused share to a later unit that needs more room", () => {
    // Regression for a Codex finding: the fair share was computed once up front and never
    // reclaimed by later units when an earlier one used less than its share. A tiny first rule
    // followed by a much longer second rule still truncated the second rule to the same fixed
    // share, cutting it off before reaching a dependent action further along, even though the
    // first rule's real (tiny) cost left far more room actually available.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- alphamarker",
        "- betamarker identifier padding padding padding words here MUST REMAIN UNTRANSLATED " +
          "always in every locale regardless of context or formatting rules applied elsewhere.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("alphamarker", "betamarker"),
      maxChars: 143,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("MUST REMAIN UNTRANSLATED");
  });

  it("locates a match for CJK query tokens without relying on ASCII word boundaries", () => {
    const padding =
      "これは一般的な説明文であり詳細な背景情報を含みますがここでは重要ではありません".repeat(6);
    const segmentText = `${padding} 特別コード は翻訳せずそのまま残してください`;

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText }),
      queryTokens: tokens("特別コード"),
      maxChars: 80,
    });

    expect(excerpt).toContain("特別コード");
  });

  it("splits sentences in uncased scripts terminated by full-width punctuation", () => {
    // Regression for a Codex finding: the sentence-boundary regex required an ASCII terminator
    // (.!?) and an uppercase letter or digit after it. CJK sentences use full-width terminators
    // (。！？) and have no case distinction at all, so this paragraph collapsed into one oversized
    // unit, and truncateAroundMatch — centered on the earliest match — couldn't reach the second,
    // distant rule even though splitting would let packing keep both and drop only the filler.
    const filler =
      "これは一般的な説明文であり詳細な背景情報を含みますがここでは重要ではありません。".repeat(3);
    const paragraph = [
      "特別コード一 は翻訳しないでください。",
      filler,
      "特別コード二 は翻訳しないでください。",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("特別コード一", "特別コード二"),
      maxChars: 103,
    });

    expect(excerpt).toContain("特別コード一");
    expect(excerpt).toContain("特別コード二");
  });

  it("splits CJK sentences with no whitespace between them", () => {
    // Regression for a Codex finding: the sentence-boundary fix still required \s+ after the
    // terminator. CJK sentences conventionally run with no space at all after 。！？
    // ("第一条。第二条。"), which is how most real Chinese/Japanese text is written — so even with
    // the fullwidth terminator recognized, a paragraph written this way still collapsed into one
    // oversized unit.
    const filler =
      "これは一般的な説明文であり詳細な背景情報を含みますがここでは重要ではありません。".repeat(3);
    const paragraph = [
      "特別コード一 は翻訳しないでください。",
      filler,
      "特別コード二 は翻訳しないでください。",
    ].join("");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("特別コード一", "特別コード二"),
      maxChars: 103,
    });

    expect(excerpt).toContain("特別コード一");
    expect(excerpt).toContain("特別コード二");
  });

  it("splits sentences wrapped in quotation marks", () => {
    // Regression for a Codex finding: the sentence-boundary lookbehind required the terminator
    // immediately before whitespace. A quoted rule like `"Keep X." "Keep Y."` puts the closing
    // quote, not the terminator, right before the space, so the boundary never matched there —
    // under a tight budget, the two quoted rules collapsed into one oversized unit and truncation
    // centered on only one of them.
    const paragraph = [
      '"Keep alphamarker unchanged across every single translation and locale without exception."',
      '"Keep betamarker unchanged across every single translation and locale without exception."',
      "Final note.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("alphamarker", "betamarker"),
      maxChars: 83,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("splits sentences that start with a lowercase identifier", () => {
    // Regression for a Codex finding: the lookahead explicitly rejected \p{Ll} (lowercase), so a
    // rule sentence starting with a lowercase protected identifier (common for these, e.g.
    // "betamarker must never be translated.") never counted as a new sentence start — under a
    // tight budget, the two rules collapsed into one oversized unit and truncation centered on
    // only the earlier one.
    const paragraph = [
      "Keep alphamarker unchanged across every single translation and locale without exception.",
      "betamarker must never be translated under any circumstances whatsoever here.",
      "Final note.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("alphamarker", "betamarker"),
      maxChars: 83,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("reserves body space instead of letting a long heading consume the whole budget", () => {
    const deeplyNestedSegment = segment({
      headingPath: [
        "Memory.md",
        "A very long section heading that eats most of the budget",
        "An equally verbose subsection name",
        "de-DE",
      ],
      segmentText: "Never translate the routingtoken internal identifier under any circumstances.",
    });

    const excerpt = buildSegmentExcerpt({
      segment: deeplyNestedSegment,
      queryTokens: tokens("routingtoken"),
      maxChars: 80,
    });

    expect(excerpt.length).toBeLessThanOrEqual(80);
  });

  it("keeps the whole matched token intact even when the heading eats most of the budget", () => {
    // Regression for a Codex finding: a body reserve of tokenLength + 10 isn't actually enough —
    // truncateAroundMatch reserves floor(budget/4) characters of lead-in before the match on top of
    // up to 6 characters for both "..." markers, so the reserve needs solving from that geometry
    // (budget >= (tokenLength + 6) * 4 / 3), not a flat per-character guess. A 24-character
    // protected identifier still lost its last few letters under the tokenLength + 10 formula.
    const deeplyNestedSegment = segment({
      headingPath: [
        "Memory.md",
        "A very long section heading that eats most of the budget",
        "An equally verbose subsection name",
        "de-DE",
      ],
      segmentText:
        "Never translate the protectedidentifiertoken internal marker under any circumstances.",
    });

    const excerpt = buildSegmentExcerpt({
      segment: deeplyNestedSegment,
      queryTokens: tokens("protectedidentifiertoken"),
      maxChars: 80,
    });

    expect(excerpt.length).toBeLessThanOrEqual(80);
    expect(excerpt).toContain("protectedidentifiertoken");
  });

  it("doesn't let the heading's own ellipsis marker eat into an already-tight body reserve", () => {
    // Regression for a Codex finding: truncateToBudget always appends a full "..." (3 chars) when
    // truncating, even for a 1-2 char budget — so when minBodyReserve's own math leaves the heading
    // only 1 char of room (maxChars - minBodyReserve landing at exactly 1, which happens whenever
    // the matched token needs more space than the budget can spare), truncateToBudget(heading, 1)
    // returned "..." (3 chars) instead of 1, silently shrinking bodyBudget 2 chars below the exact
    // minimum minBodyReserve had just computed as necessary to keep the token intact.
    const deeplyNestedSegment = segment({
      headingPath: [
        "Memory.md",
        "A very long section heading that eats most of the budget",
        "An equally verbose subsection name",
        "de-DE",
      ],
      segmentText:
        "Never translate the protectedidentifiertoken internal marker under any circumstances.",
    });

    // 41 = minCharsToKeepSpanIntact(24) + 1, chosen so maxChars - minBodyReserve lands at exactly 1.
    const excerpt = buildSegmentExcerpt({
      segment: deeplyNestedSegment,
      queryTokens: tokens("protectedidentifiertoken"),
      maxChars: 41,
    });

    expect(excerpt.length).toBeLessThanOrEqual(41);
    expect(excerpt).toContain("protectedidentifiertoken");
  });

  it("keeps an apostrophe-containing matched token intact even when the heading eats most of the budget", () => {
    // Regression for a Codex finding: findBestMatchOffset strips internal apostrophes before
    // comparing a raw match against tokenWeights ("rock'n'roll" -> "rocknroll"), so tokenWeights'
    // keys are shorter than the actual span in the source text that must survive truncation.
    // Sizing the body reserve from the stripped key length under-reserved for this case, letting
    // the centering window's own trim cut off the token's tail (e.g. "rock'n'rol...").
    const deeplyNestedSegment = segment({
      headingPath: [
        "Memory.md",
        "A very long section heading that eats most of the budget",
        "An equally verbose subsection name",
        "de-DE",
      ],
      segmentText: "Never translate the rock'n'roll internal marker under any circumstances.",
    });

    const excerpt = buildSegmentExcerpt({
      segment: deeplyNestedSegment,
      queryTokens: tokens("rock'n'roll"),
      maxChars: 80,
    });

    expect(excerpt.length).toBeLessThanOrEqual(80);
    expect(excerpt).toContain("rock'n'roll");
  });

  it("marks a truncated tail with an ellipsis instead of silently cutting off the last word", () => {
    // Regression for a Codex finding: hasSuffix compared the text length against start + maxChars
    // — the window *before* the prefix marker's 3-char cost is subtracted — instead of against
    // where the slice actually ends. When the source ends within those 3 characters of that
    // boundary, this reported "no suffix" and bodyChars then sliced short of the real text end
    // with no ellipsis to show anything was cut, silently corrupting the final word (e.g. a
    // trailing "MUST" emitted as "MUS").
    const paragraph =
      "Padding word one two three four five six seven the querytoken marker appears right " +
      "here in this sentence and then continues on with more filler words to reach the end " +
      "where it MUST.";

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("querytoken"),
      maxChars: 197,
    });

    expect(excerpt.endsWith("MUS")).toBe(false);
    expect(excerpt.endsWith("MUST") || excerpt.endsWith("...")).toBe(true);
  });

  it("allocates enough share to retain a long matched token when a later ranked unit needs far less", () => {
    // Regression for a Codex finding: an equal per-unit share can be shorter than a matched token
    // even when the combined budget could retain every match in full, because the split didn't
    // account for how little some units actually need. A 31-char identifier ranked first got an
    // equal (half) share and lost its tail, even though the second unit ("Keep betamarker
    // unchanged.") only needs a fraction of its own equal share to keep its own match intact.
    const paragraph = [
      "Never translate the protectedidentifiertoken32chars marker under any circumstances.",
      "Keep betamarker unchanged.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("protectedidentifiertoken32chars", "betamarker"),
      maxChars: 100,
    });

    expect(excerpt).toContain("protectedidentifiertoken32chars");
    expect(excerpt).toContain("betamarker");
  });

  it("keeps the opening rule for a heading-driven match instead of only an incidental body match", () => {
    // Regression for a Codex finding: the segment is selected because "routingtoken" is in its
    // heading, not because that word appears in its body. Its body's only literal query overlap
    // is an incidental locale mention near the end, unrelated to the actual rule at the start.
    const routingSegment = segment({
      headingPath: ["Memory.md", "routingtoken"],
      segmentText: [
        "Never translate the internal identifier under any circumstances.",
        "This section applies broadly across checkout flows.",
        "This guidance also applies to the de-DE locale rollout.",
      ].join(" "),
    });

    const excerpt = buildSegmentExcerpt({
      segment: routingSegment,
      queryTokens: tokens("routingtoken", "de-DE"),
      maxChars: 200,
    });

    expect(excerpt).toContain("Never translate the internal identifier");
  });

  it("keeps the opener for a language-level locale heading without treating the code as a body token", () => {
    const frenchSegment = segment({
      headingPath: ["Memory.md", "Locale notes", "fr"],
      segmentText: [
        "Always keep the brand name capitalized exactly as written.",
        "This section also discusses checkout flows for testing purposes here today.",
      ].join(" "),
    });

    const excerpt = buildSegmentExcerpt({
      segment: frenchSegment,
      queryTokens: tokens("checkout"),
      inputLocales: ["fr-fr"],
      maxChars: 160,
    });

    expect(excerpt).toContain("Always keep the brand name capitalized");
    expect(excerpt).not.toMatch(
      /^Memory\.md > Locale notes > fr -> This section also discusses checkout/,
    );
  });

  it("reserves room for the top-ranked match instead of letting the forced opener crowd it out", () => {
    // Regression for a Codex finding: forcedFirstUnit used to be added before the ranked loop
    // unconditionally. When it very nearly fills a tight bodyBudget, the actual top-ranked match —
    // the reason the segment was selected — fails tryAdd right after and gets silently dropped.
    const routingSegment = segment({
      headingPath: ["Memory.md", "Checkout"],
      segmentText: [
        "This covers general formatting practices.",
        "Never translate the tailmarker identifier.",
      ].join(" "),
    });

    const excerpt = buildSegmentExcerpt({
      segment: routingSegment,
      queryTokens: tokens("checkout", "tailmarker"),
      maxChars: 74,
    });

    expect(excerpt).toContain("tailmarker");
  });

  it("reserves room for every ranked match, not just the top one, before the forced opener", () => {
    // Regression for a Codex finding: the earlier fix only reserved space for rankedUnits[0]
    // before adding the opener. With two independent ranked matches, the opener could still fit
    // alongside the first one and crowd out the second, even though both matches together (without
    // the opener) would have fit on their own.
    const routingSegment = segment({
      headingPath: ["Memory.md", "Checkout"],
      segmentText: [
        "This covers general formatting practices here.",
        "Never translate the alphamarker identifier.",
        "Never translate the betamarker identifier.",
      ].join(" "),
    });

    const excerpt = buildSegmentExcerpt({
      segment: routingSegment,
      queryTokens: tokens("checkout", "alphamarker", "betamarker"),
      maxChars: 124,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("gives the forced opener a real reserved share instead of zero when ranked text is long", () => {
    // Regression for a Codex finding: the forced opener's only room came from a leftover check
    // run after ranked packing, with no reservation of its own. When the single ranked match's
    // own text is long enough to fill whatever budget tryAddRankedUnit hands it (truncated via
    // truncateAroundMatch, which always uses its full cap), that leftover was zero — the opener
    // never appeared no matter how large maxChars got, even far above what the ranked match
    // actually needs to stay intact.
    const routingSegment = segment({
      headingPath: ["Memory.md", "routingtoken"],
      segmentText: [
        "Never translate the internal identifier under any circumstances.",
        "This section applies broadly across checkout flows for every locale.",
        "This section mentions routingtoken explicitly here for reference.",
      ].join(" "),
    });

    const excerpt = buildSegmentExcerpt({
      segment: routingSegment,
      queryTokens: tokens("routingtoken"),
      maxChars: 70,
    });

    expect(excerpt).toContain("routingtoken");
    expect(excerpt).toContain("Never tra");
  });

  it("centers on the highest-weighted match within an oversized unit, not the earliest one", () => {
    // Regression for a Codex finding: within a single already-oversized unit, the truncation
    // window always centered on whichever query token occurred earliest in the text. A generic
    // term (commonword, diluted by also appearing in a second bullet) occurring early lost out to
    // a rare, specific one (tailmarker) occurring later in the same unit — even though the rare
    // term is the actual reason the query matched.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- The commonword flow must render every single step in order across every locale and " +
          "screen for every commonword session, with a great deal of additional padding text " +
          "included here purely to push this bullet well past a tight character budget, and the " +
          "actual tailmarker rule that matters sits right here at the very end of this bullet.",
        "- The commonword should always show the order total above the shipping address.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("commonword", "tailmarker"),
      maxChars: 100,
    });

    expect(excerpt).toContain("tailmarker");
  });

  it("truncates a later ranked unit into the remaining budget instead of dropping it", () => {
    // Regression for a Codex finding: packUnitsWithinBudget filtered out any ranked unit that
    // didn't fit whole in the remaining budget, even when there was still meaningful room left. A
    // second, independently-matching rule was silently dropped entirely instead of keeping a
    // truncated fragment of it.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- Never translate the alphamarker identifier.",
        "- betamarker rule applies broadly across every single translation workflow and screen " +
          "state regardless of locale or context, with a great deal of additional identifying " +
          "padding text appended here purely to exceed the remaining budget for this test.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("alphamarker", "betamarker"),
      maxChars: 113,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("locates a match containing an apostrophe instead of falling back to a prefix cut", () => {
    // Regression for a Codex finding: the shared tokenizer strips apostrophes before scoring, so
    // a query for "don't" arrives as the token "dont" — but the match-locating search still ran
    // against the original (apostrophe-intact) text and found nothing, silently falling back to a
    // plain prefix cut instead of centering on the real match.
    const longSentence =
      "The onlymarker guidance covers many general formatting steps repeated here to push this " +
      "single sentence well past the character budget, and remember please don't skip the final " +
      "validation check under any circumstances whatsoever.";

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: longSentence }),
      queryTokens: tokens("don't"),
      maxChars: 80,
    });

    expect(excerpt).toContain("don't");
  });

  it("prefers the following action over unrelated prior context when only one neighbour fits", () => {
    // Regression for a Codex finding: packUnitsWithinBudget always tried the previous neighbour
    // before the next one. When budget only fits the matched condition plus one neighbour, an
    // unrelated preceding sentence used to win that slot even when the real dependent half — the
    // rule's action — was the following sentence instead.
    const paragraph = [
      "This paragraph opens with unrelated formatting context only.",
      "When the source text contains a discountcode marker, treat it as a promotional string here.",
      "Always apply the promostyling guide to that label regardless of locale.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("discountcode"),
      maxChars: 203,
    });

    expect(excerpt).toContain("discountcode");
    expect(excerpt).toContain("promostyling");
  });

  it("keeps two independent matches instead of letting one's filler neighbour crowd out the other", () => {
    // Regression for a Codex finding: packUnitsWithinBudget added each ranked match's neighbours
    // immediately after that match, before moving on to the next ranked match. Two short matches
    // that would both fit on their own could still lose one of them if the first match's filler
    // neighbour got pulled in and used up the room the second match needed.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: [
        "- Never translate the alphamarker identifier.",
        "- This bullet is unrelated filler content used only to consume budget space for this test.",
        "- Never translate the betamarker identifier.",
      ].join("\n"),
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("alphamarker", "betamarker"),
      maxChars: 173,
    });

    expect(excerpt).toContain("alphamarker");
    expect(excerpt).toContain("betamarker");
  });

  it("prefers the following parser-level neighbour over unrelated preceding filler", () => {
    // Regression for a Codex finding: withNeighbourContext always spent budget on
    // previousNeighbourText before considering nextNeighbourText. When a single-unit segment
    // touches both segment boundaries and budget fits only one parser-level neighbour, unrelated
    // preceding filler used to win over the segment's actual following action.
    const singleUnitSegment = segment({
      segmentText: "Never translate the discountcode identifier.",
      previousNeighbourText:
        "Unrelated preceding filler context used only for this test scenario padding out the text.",
      nextNeighbourText: "Always apply the promostyling guide to that label regardless of locale.",
    });

    const excerpt = buildSegmentExcerpt({
      segment: singleUnitSegment,
      queryTokens: tokens("discountcode"),
      maxChars: 153,
    });

    expect(excerpt).toContain("discountcode");
    expect(excerpt).toContain("promostyling");
  });

  it("includes the parser-level neighbour when a rule's action lives in the next segment", () => {
    // Regression for a Codex finding: a condition/action pair can be split across two parsed
    // segments (e.g. a bullet followed by a paragraph), not just across sentences within one.
    // That context lives in previousNeighbourText/nextNeighbourText, outside segmentText.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: "- Never translate the discountcode identifier.",
      nextNeighbourText: "Always apply the promostyling guide to that label regardless of locale.",
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("discountcode"),
      maxChars: 300,
    });

    expect(excerpt).toContain("discountcode");
    expect(excerpt).toContain("promostyling");
  });

  it("does not pull in neighbour context when there is no budget left for it", () => {
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: "- Never translate the discountcode identifier.",
      nextNeighbourText: "Always apply the promostyling guide to that label regardless of locale.",
    });

    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("discountcode"),
      maxChars: 60,
    });

    expect(excerpt.length).toBeLessThanOrEqual(60);
    expect(excerpt).toContain("discountcode");
    expect(excerpt).not.toContain("promostyling");
  });

  it("centers on the real token occurrence, not a false-positive substring match", () => {
    // Regression for a Codex finding: a plain substring search for "cart" would match inside
    // "cartography" first, centering the excerpt there and discarding the real "cart" rule later
    // in the same oversized unit.
    const longSentence =
      `A cartography reference guide is unrelated filler text repeated to push this single ` +
      `sentence well past the character budget so it must be truncated around a match. ${"padding word ".repeat(6)}Never abbreviate the cart label in checkout under any circumstances whatsoever here.`;

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: longSentence }),
      queryTokens: tokens("cart"),
      maxChars: 80,
    });

    expect(excerpt).toContain("cart label");
  });

  it("does not let an appended neighbour separator push the excerpt past bodyBudget", () => {
    // Regression for a Codex finding: appending `separator + suffix` after truncating the
    // suffix to the full remaining budget overruns bodyBudget by separator.length.
    const bulletSegment = segment({
      kind: "bullet_group",
      segmentText: "- Never translate the discountcode identifier.",
      nextNeighbourText: "Always apply the promostyling guide to that label regardless of locale.",
    });

    const maxChars = 120;
    const excerpt = buildSegmentExcerpt({
      segment: bulletSegment,
      queryTokens: tokens("discountcode"),
      maxChars,
    });

    expect(excerpt.length).toBeLessThanOrEqual(maxChars);
  });

  it("splits sentences that start with an accented capital instead of merging them", () => {
    // Regression for a Codex finding: the sentence-boundary regex only recognized ASCII
    // A-Z/0-9 after the terminator, so a sentence starting with an accented capital (É, Ç, ...)
    // never counted as a new sentence. A paragraph under the 400-char oversized-unit cutoff, with
    // an unrelated filler sentence between two rule sentences, then collapsed into one giant unit.
    // The single-window truncateAroundMatch centers on the earliest match and can't reach a second
    // rule far past its window, even though splitting would let packing keep both rule sentences
    // and drop only the irrelevant filler between them.
    const padding =
      "Écrivez toujours des notes générales sans importance ici pour combler cet espace. ".repeat(
        3,
      );
    const paragraph = [
      "Évitez toujours le mot firstrule dans le texte.",
      padding.trim(),
      "Étudiez toujours la règle secondrule avant de valider.",
    ].join(" ");

    const excerpt = buildSegmentExcerpt({
      segment: segment({ segmentText: paragraph }),
      queryTokens: tokens("firstrule", "secondrule"),
      maxChars: 150,
    });

    expect(excerpt).toContain("firstrule");
    expect(excerpt).toContain("secondrule");
  });

  it("is deterministic across repeated calls with the same input", () => {
    const longParagraph = [
      "The firstrule token applies at the start of this paragraph for every locale.",
      "This is unrelated filler prose about generic checkout localisation practices repeated to add length.".repeat(
        6,
      ),
      "The secondrule token applies near the end of this same paragraph for every locale.",
    ].join(" ");

    const input = {
      segment: segment({ segmentText: longParagraph }),
      queryTokens: tokens("firstrule", "secondrule"),
      maxChars: 250,
    };

    expect(buildSegmentExcerpt(input)).toBe(buildSegmentExcerpt(input));
  });
});

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
import {
  canonicalizeSpellingVariant,
  expandKnowledgeMemoryTokens,
  knowledgeMemoryHeadingMatchesLocales,
} from "./knowledge-memory-lexical-retriever";
import type { KnowledgeMemorySegment } from "./knowledge-memory-selection.types";

type ExcerptUnit = {
  text: string;
  offset: number;
};

// ponytail: fixed word-count chunking for oversized/unpunctuated units — good enough to avoid
// dropping a matching rule entirely; upgrade to clause-aware splitting if multi-rule single
// sentences turn out to be common in real memory documents.
const fallbackChunkWordCount = 25;
const oversizedSentenceChars = 400;

// Exported for reuse: knowledge-memory-selection.ts's fallback-text truncation used to
// reimplement this same slice+ellipsis logic independently (missing the small-budget fix below).
export function truncateToBudget(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }
  // A budget under 3 chars can't fit the "..." marker without exceeding maxChars itself (e.g.
  // slice(0,0)+"..." is 3 chars, already over a maxChars of 1 or 2) — plain-slice instead of
  // guaranteeing an over-budget ellipsis in that narrow band. Budgets this small only actually
  // arise from a caller's own reserve math (see buildSegmentExcerpt's headingPrefix), where going
  // even 1-2 chars over silently eats into a budget another reserve formula already sized exactly.
  if (maxChars < 3) {
    return text.slice(0, Math.max(0, maxChars));
  }
  return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

// Matches a run of letters/numbers/hyphens, optionally continuing through an internal apostrophe
// ("don't", "y'all") — the same word shape tokenize() in knowledge-memory-lexical-retriever.ts
// produces, just without discarding the apostrophe or the position. Matching whole runs (instead
// of searching for each token as a substring) also means "cart" can never match inside
// "cartography": matchAll only ever yields "cartography" as one run, never a "cart"-sized slice
// of it.
const wordPattern = /[\p{L}\p{N}-]+(?:['’][\p{L}\p{N}-]+)*/gu;

/**
 * Finds the offset of the highest-weighted query-token match, not just the first one. Weight
 * comes from the same 1/(matching-unit-count) scheme rankMatchingUnits uses: a generic word that
 * also matches other units in the segment (e.g. "checkout") is worth less than a rare one that
 * matches only this unit (e.g. a protected identifier). Without this, a query for both, appearing
 * early and late in one oversized unit, always centered on the earlier — usually more generic —
 * occurrence and lost the specific one the query actually cared about. Ties (equal weight) break
 * on earliest offset for determinism.
 *
 * One pass over the text via matchAll, not one regex scan per query token: the preview API allows
 * sourceText up to 100,000 characters, which can produce thousands of query tokens against a
 * single oversized (tens-of-thousands-of-characters) unit — scanning the whole text once per token
 * made that O(query tokens × text length) and measurably slow (seconds) at that scale.
 */
function findBestMatchOffset(
  text: string,
  queryTokens: Set<string>,
  tokenWeights: Map<string, number>,
): number | null {
  let best: { offset: number; weight: number } | null = null;
  for (const match of text.matchAll(wordPattern)) {
    const token = match[0].toLowerCase().replace(/['’]/g, "");
    if (!queryTokens.has(token)) {
      continue;
    }
    const weight = tokenWeights.get(token) ?? 1;
    if (!best || weight > best.weight) {
      best = { offset: match.index, weight };
    }
  }
  return best?.offset ?? null;
}

/**
 * Longest raw matched span across the ranked units, in source characters — not the longest
 * tokenWeights key. findBestMatchOffset strips internal apostrophes before comparing a match
 * against tokenWeights ("rock'n'roll" -> "rocknroll"), so the map's keys are shorter than the
 * text truncateAroundMatch must actually keep intact around the match. Reserving the body budget
 * from the stripped key length under-reserves for any matched token containing an apostrophe,
 * letting the centering window's own trim cut into the middle of the real span (e.g. "rocknroll"
 * queried against "rock'n'roll" emitting "rock'n'rol...").
 */
function longestMatchedSpanLength(units: ExcerptUnit[], tokenWeights: Map<string, number>): number {
  let longest = 0;
  for (const unit of units) {
    for (const match of unit.text.matchAll(wordPattern)) {
      if (match[0].length <= longest) {
        continue;
      }
      const token = match[0].toLowerCase().replace(/['’]/g, "");
      if (tokenWeights.has(token)) {
        longest = match[0].length;
      }
    }
  }
  return longest;
}

// Solved from truncateAroundMatch's own centering geometry (see buildSegmentExcerpt's heading-
// reserve comment for the full derivation): leadChars reserves floor(budget/4) before the match,
// up to 6 chars go to both ellipsis markers, leaving budget - budget/4 - 6 for the token and
// whatever follows it. Requiring that be >= spanLength (using the safe lower bound budget -
// budget/4 = (3/4)budget) solves to budget >= (spanLength + 6) * 4 / 3.
function minCharsToKeepSpanIntact(spanLength: number): number {
  return Math.ceil(((spanLength + 6) * 4) / 3);
}

/**
 * Truncates text that's still too long even after unit splitting/packing. A plain prefix cut
 * would reintroduce the exact bug this module exists to fix (one level down, inside a single
 * oversized unit), so this centers the kept window on the query match instead of the start.
 */
function truncateAroundMatch(
  text: string,
  maxChars: number,
  queryTokens: Set<string>,
  tokenWeights: Map<string, number>,
) {
  if (text.length <= maxChars || maxChars <= 0) {
    return truncateToBudget(text, maxChars);
  }

  const matchOffset = findBestMatchOffset(text, queryTokens, tokenWeights);
  if (matchOffset === null) {
    return truncateToBudget(text, maxChars);
  }

  const leadChars = Math.floor(maxChars / 4);
  const start = Math.max(0, matchOffset - leadChars);
  const hasPrefix = start > 0;
  const prefixMarker = hasPrefix ? "..." : "";
  // Whether a suffix marker is needed depends on where the slice actually ends, which already
  // has the prefix marker's cost subtracted — checking against start + maxChars (the window
  // before that cost is applied) reports "no suffix" whenever the source ends within the prefix
  // marker's length of that boundary, silently dropping those trailing characters with no
  // ellipsis to show they were cut (e.g. "MUST" -> "MUS").
  const bodyCharsBeforeSuffixReserve = Math.max(0, maxChars - prefixMarker.length);
  const hasSuffix = start + bodyCharsBeforeSuffixReserve < text.length;
  const suffixMarker = hasSuffix ? "..." : "";
  const bodyChars = Math.max(0, maxChars - prefixMarker.length - suffixMarker.length);

  return `${prefixMarker}${text.slice(start, start + bodyChars)}${suffixMarker}`;
}

function chunkByWords(text: string, wordsPerChunk: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= wordsPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += wordsPerChunk) {
    chunks.push(words.slice(index, index + wordsPerChunk).join(" "));
  }
  return chunks;
}

// The lookahead accepts any letter (\p{L}) as a sentence start, not just uppercase — earlier
// versions required \p{Lu} specifically, which rejected every sentence that legitimately starts
// lowercase, and protected identifiers/rule text in these documents often do ("betamarker must
// never be translated."). Requiring \s+ after an ASCII terminator (see below) still prevents
// splitting mid-decimal or right after an abbreviation's period with no following space; accepting
// lowercase after that space can occasionally over-split ("e.g. apples" → two units), but that's
// just extra fragmentation, not content loss — packUnitsWithinBudget's neighbour-pulling already
// reassembles adjacent related units when it matters, and nothing here permanently drops text.
//
// The terminator side is split into two alternatives rather than one shared \s+: CJK sentences
// conventionally run with no space at all after 。！？ ("第一条。第二条。"), so requiring \s+
// there — even with the fullwidth punctuation itself recognized — still failed to split them.
// ASCII .!? keeps requiring \s+; 。！？ allow a zero-width boundary immediately after, matching
// how those scripts are actually written.
//
// Both terminator branches also allow an optional closing quote ("'”’) between the terminator and
// the whitespace: a quoted rule like `"Keep X." "Keep Y."` puts the closing quote, not the
// terminator itself, immediately before the space, so the plain terminator-only lookbehind never
// matched there. The lookahead correspondingly accepts typographic opening quotes (“‘) alongside
// the straight ones, so a sentence that starts with one still counts as a valid boundary.
const sentenceBoundary = /(?:(?<=[.!?]["”’]?)\s+|(?<=[。！？]["”’]?)\s*)(?=[\p{L}\p{Nd}"“‘(])/u;

function splitIntoSentences(normalized: string): string[] {
  const sentences = normalized
    .split(sentenceBoundary)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length > 0 ? sentences : [normalized];
}

function splitParagraphUnits(segmentText: string): ExcerptUnit[] {
  const normalized = segmentText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const units: ExcerptUnit[] = [];
  let offset = 0;
  for (const sentence of splitIntoSentences(normalized)) {
    // Recognizes CJK terminators (。！？) as "properly terminated" too, not just ASCII .!? —
    // sentenceBoundary above was taught to split on them, so every CJK sentence it produces ends
    // in one of these and would otherwise always look "unterminated" here and go through
    // chunkByWords needlessly (usually a no-op for space-sparse CJK text, but not when Latin
    // tokens are embedded in it).
    const needsFallbackChunking =
      sentence.length > oversizedSentenceChars || !/[.!?。！？]$/.test(sentence);
    const pieces = needsFallbackChunking
      ? chunkByWords(sentence, fallbackChunkWordCount)
      : [sentence];
    for (const piece of pieces) {
      units.push({ text: piece, offset: offset++ });
    }
  }
  return units;
}

function splitBulletUnits(segmentText: string): ExcerptUnit[] {
  return segmentText
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")
        .trim(),
    )
    .filter(Boolean)
    .map((text, offset) => ({ text, offset }));
}

/**
 * Ranks units by a score weighted 1 / (number of units that token matches): a token that shows up
 * in most bullets (a generic word like "checkout") contributes little to any single unit's score;
 * a token that shows up in exactly one bullet (a protected identifier) contributes a full point
 * there. Without this, equal integer scores fall back to document order, so an early bullet that
 * only matches the generic term can outrank — and, if oversized, fully hide — a later bullet
 * that's the actual reason the query matched anything at all.
 *
 * Tokenizes each unit exactly once and reuses those cached sets for both the matching-unit counts
 * and the per-unit scores below, rather than re-tokenizing per query token — the previous version
 * did that inside a queryTokens loop, making this O(query tokens × units × unit length). The
 * preview API allows sourceText up to 100,000 characters and memories up to 50,000, which can
 * produce thousands of tokens and units; re-tokenizing per token pair made a single segment take
 * tens of seconds.
 */
function rankMatchingUnits(
  units: ExcerptUnit[],
  queryTokens: Set<string>,
): { ranked: ExcerptUnit[]; tokenWeights: Map<string, number> } {
  if (queryTokens.size === 0) {
    return { ranked: [], tokenWeights: new Map() };
  }

  const unitTokenSets = units.map((unit) => expandKnowledgeMemoryTokens(unit.text));

  const matchingUnitCounts = new Map<string, number>();
  for (const tokens of unitTokenSets) {
    for (const token of tokens) {
      if (queryTokens.has(token)) {
        matchingUnitCounts.set(token, (matchingUnitCounts.get(token) ?? 0) + 1);
      }
    }
  }

  // Exposed alongside the ranked units so callers that later need to center a truncation window
  // within a single oversized unit's text (findBestMatchOffset) can weigh those matches the same
  // way this scoring pass already does, instead of just taking whichever occurs first.
  const tokenWeights = new Map(
    [...matchingUnitCounts.entries()].map(([token, count]) => [token, 1 / count]),
  );

  const ranked = units
    .map((unit, index) => {
      let score = 0;
      // A unit's expanded token set can hold both a word and its synthesized spelling variant
      // (expandTokens adds "colour" alongside a literal "color") even though only one of them
      // actually occurs in the text. Counting both as independent evidence inflates a unit with a
      // single generic word above a unit with one genuinely rare token — e.g. a "color" bullet
      // scoring 2 while a "protectedtoken" bullet scores 1 — which can rank a generic match ahead
      // of the actual reason the query matched anything, and starve it of packing budget under a
      // tight cap. Each variant family only ever contributes once per unit.
      const countedFamilies = new Set<string>();
      for (const token of unitTokenSets[index]!) {
        const weight = tokenWeights.get(token);
        if (!weight) {
          continue;
        }
        const family = canonicalizeSpellingVariant(token);
        if (countedFamilies.has(family)) {
          continue;
        }
        countedFamilies.add(family);
        score += weight;
      }
      return { unit, score };
    })
    .filter((scored) => scored.score > 0)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.unit.offset - b.unit.offset))
    .map((scored) => scored.unit);

  return { ranked, tokenWeights };
}

/**
 * Whether the segment's own heading vocabulary overlaps the query — a signal that retrieval may
 * have picked this segment for its heading rather than its body. When that's true, the opening
 * unit is where a heading-associated rule is most likely to live (mirrors how the old prefix
 * preview always started at the beginning), so it's worth keeping even if it has no token overlap
 * of its own — see forcedFirstUnit below.
 */
function headingMatchesQuery(
  segment: KnowledgeMemorySegment,
  queryTokens: Set<string>,
  inputLocales: string[] = [],
): boolean {
  const headingTokens = expandKnowledgeMemoryTokens(segment.headingPath.join(" "));
  for (const token of queryTokens) {
    if (headingTokens.has(token)) {
      return true;
    }
  }
  return knowledgeMemoryHeadingMatchesLocales(segment.headingPath, inputLocales);
}

// The smallest cap a unit actually needs: its own full length when that already fits within the
// span-preserving minimum, otherwise the span-preserving minimum itself — enough for
// truncateAroundMatch to keep this unit's own longest matched span intact. Reserving each
// remaining unit's real need (not an equal share) means a unit with a long matched token isn't
// shortchanged just because units ranked after it would have been content with far less.
function unitMinimalNeed(
  unit: ExcerptUnit,
  tokenWeights: Map<string, number>,
  minTruncatedChars: number,
): number {
  const spanLength = longestMatchedSpanLength([unit], tokenWeights);
  const need = spanLength > 0 ? minCharsToKeepSpanIntact(spanLength) : minTruncatedChars;
  return Math.min(unit.text.length, Math.max(need, minTruncatedChars));
}

function packUnitsWithinBudget(
  rankedUnits: ExcerptUnit[],
  unitsByOffset: Map<number, ExcerptUnit>,
  budget: number,
  separator: string,
  forcedFirstUnit: ExcerptUnit | undefined,
  queryTokens: Set<string>,
  tokenWeights: Map<string, number>,
) {
  const chosen = new Map<number, ExcerptUnit>();
  let used = 0;

  const tryAdd = (unit: ExcerptUnit) => {
    if (chosen.has(unit.offset)) {
      return true;
    }
    const additional = (chosen.size > 0 ? separator.length : 0) + unit.text.length;
    if (used + additional > budget) {
      return false;
    }
    chosen.set(unit.offset, unit);
    used += additional;
    return true;
  };

  // Give every ranked match only as much of what's actually left as it needs, reserving the rest
  // for units still to come — rather than an equal split of what's left, which can shortchange a
  // unit with a long matched token just because units ranked after it need much less. With a
  // 30-char protected identifier ranked first and a short "Keep betamarker." ranked second under a
  // tight budget, an equal split gave each unit half, truncating the identifier below its own
  // length even though the combined budget easily fits both in full once the short unit's real
  // (tiny) need is reserved instead of an equal share for it. Recomputing the reservation from the
  // units still to come each time — not a fixed split computed once up front — also still folds
  // any earlier surplus into what's left for the rest automatically.
  //
  // unitNeeds/suffixNeedSum precompute each unit's own need once and prefix-sum them, rather than
  // rescanning every remaining unit's text on every single unit's turn (O(rankedUnits²) matchAll
  // scans) — a memory can have hundreds of bullets sharing a common matched token.
  const minTruncatedChars = 12;
  const unitNeeds = rankedUnits.map((unit) =>
    unitMinimalNeed(unit, tokenWeights, minTruncatedChars),
  );
  const suffixNeedSum: number[] = Array.from({ length: rankedUnits.length + 1 }, () => 0);
  for (let index = rankedUnits.length - 1; index >= 0; index--) {
    suffixNeedSum[index] = suffixNeedSum[index + 1]! + unitNeeds[index]!;
  }

  // forcedFirstUnit is placed after every ranked match (see the comment below on why), but that
  // used to mean it competed for whatever was left with no reservation of its own — unlike every
  // ranked unit, which always gets at least its own need. Reserving a small minTruncatedChars-sized
  // floor for it here, folded into ranked units' own reservation math the same way a trailing
  // ranked unit's need would be, guarantees it a real (if modest) shot instead of an all-or-nothing
  // leftover check once ranked packing has already spent everything.
  //
  // Capped at the surplus left over once every ranked unit's own need is covered (never more than
  // the flat floor above that surplus). A ranked match is still the reason the segment was
  // selected and must never lose its own guaranteed share to make room for this reservation — capping
  // here, rather than reserving the flat floor unconditionally, keeps tryAddRankedUnit's `remaining`
  // from dropping a ranked unit's cap below minTruncatedChars purely because of this reservation when
  // the budget was already too tight to fit both.
  const totalRankedNeed =
    suffixNeedSum[0]! + separator.length * Math.max(0, rankedUnits.length - 1);
  const forcedFirstReserve = forcedFirstUnit
    ? Math.min(minTruncatedChars + separator.length, Math.max(0, budget - totalRankedNeed))
    : 0;

  const tryAddRankedUnit = (unit: ExcerptUnit, index: number) => {
    const remaining = budget - used - forcedFirstReserve - (chosen.size > 0 ? separator.length : 0);
    const restCount = rankedUnits.length - 1 - index;
    const reserveForRest = suffixNeedSum[index + 1]! + separator.length * restCount;
    // Never let the current unit's share collapse below its own real need just because the units
    // still to come would, combined, claim more than the budget can actually hold — with two
    // discriminative matches followed by many low-value units sharing a common token, reserving
    // every one of that tail's needs in full could zero out the second discriminative match's
    // share even though its own need is small and easily affordable; those tail units simply won't
    // all fit regardless; guaranteeing every ranked unit a shot at its own need, not just the
    // first, is what actually keeps a real shot available (a fixed one-time exception for index 0
    // isn't enough — the same starvation can land on any unit before a long shared-token tail).
    const share = Math.max(unitNeeds[index]!, remaining - reserveForRest);
    const cap = Math.min(share, remaining);
    if (unit.text.length <= cap) {
      return tryAdd(unit);
    }
    if (cap < minTruncatedChars) {
      return false;
    }
    return tryAdd({
      text: truncateAroundMatch(unit.text, cap, queryTokens, tokenWeights),
      offset: unit.offset,
    });
  };

  // Place every ranked match first, before spending any budget on the heading-driven opener or
  // neighbour context: a match is the reason the segment was selected, so every one of them
  // outranks "nice to have" context for a shared, limited budget. Reserving room for only the
  // top-ranked match here isn't enough — with more than one ranked match, the opener could still
  // fit alongside the first but crowd out a later, independently-matching unit that all of them
  // together would otherwise have fit without it.
  const placed = rankedUnits.filter((unit, index) => tryAddRankedUnit(unit, index));

  if (forcedFirstUnit) {
    // Uses whatever's actually left, not just the forcedFirstReserve floor — that floor only
    // exists to stop ranked-unit packing above from spending it away, not to cap what this unit
    // gets once its turn comes; ranked units may well have left more than the floor unused, and
    // this should use all of it. Falls back to a plain-prefix truncation (not centered, since this
    // unit was never chosen for a query match to center on) instead of all-or-nothing, same as
    // every ranked unit gets.
    const remaining = budget - used - (chosen.size > 0 ? separator.length : 0);
    if (forcedFirstUnit.text.length <= remaining) {
      tryAdd(forcedFirstUnit);
    } else if (remaining >= minTruncatedChars) {
      tryAdd({
        text: truncateToBudget(forcedFirstUnit.text, remaining),
        offset: forcedFirstUnit.offset,
      });
    }
  }

  for (const unit of placed) {
    // Pull in the immediate neighbours so a rule split across adjacent sentences/bullets — e.g.
    // "When the source contains X" followed by "translate it as Y" — doesn't lose its other half
    // just because that half alone has no query-token overlap. The prefix preview this replaces
    // kept both as long as they fit within budget; this restores that for the units that matched.
    // next before previous: a rule's condition is more often followed by its action ("When X...
    // Translate as Y") than preceded by one, so when only one neighbour fits, prefer the one more
    // likely to be the dependent half over unrelated prior context.
    const next = unitsByOffset.get(unit.offset + 1);
    if (next) {
      tryAdd(next);
    }
    const previous = unitsByOffset.get(unit.offset - 1);
    if (previous) {
      tryAdd(previous);
    }
  }

  return [...chosen.values()].sort((a, b) => a.offset - b.offset);
}

/**
 * Appends parser-level neighbour context (text from the adjacent segment) when packing touched
 * the very start or end of this segment and budget remains. A condition/action pair can be split
 * across two parsed segments — e.g. a bullet followed by a paragraph — not just across sentences
 * within one; those live outside `segment.segmentText` entirely, in `previousNeighbourText` /
 * `nextNeighbourText`, which the old prefix preview included but per-unit packing otherwise can't
 * reach. Best-effort: skipped whenever there's no budget left or the tail is too thin to be useful.
 */
function withNeighbourContext(input: {
  body: string;
  segment: KnowledgeMemorySegment;
  touchesStart: boolean;
  touchesEnd: boolean;
  separator: string;
  bodyBudget: number;
}): string {
  const minUsefulChars = 12;
  let result = input.body;

  // next before previous, same as packUnitsWithinBudget: a condition's action more often follows
  // it than precedes it, so when both parser-level neighbours are eligible but budget fits only
  // one, spend it on nextNeighbourText first rather than always taking previousNeighbourText.
  if (input.touchesEnd && input.segment.nextNeighbourText) {
    const remaining = input.bodyBudget - result.length - input.separator.length;
    if (remaining >= minUsefulChars) {
      const suffix = truncateToBudget(input.segment.nextNeighbourText, remaining);
      result = `${result}${input.separator}${suffix}`;
    }
  }

  if (input.touchesStart && input.segment.previousNeighbourText) {
    // Reserve the separator's own length before truncating: the separator is appended in
    // addition to this truncated text, so leaving it out of the truncation budget lets the
    // result overrun bodyBudget by separator.length.
    const remaining = input.bodyBudget - result.length - input.separator.length;
    if (remaining >= minUsefulChars) {
      const prefix = truncateToBudget(input.segment.previousNeighbourText, remaining);
      result = `${prefix}${input.separator}${result}`;
    }
  }

  return result;
}

/**
 * Builds the text sent to the prompt for a single selected segment. Unlike the parser's
 * precomputed `compactPromptText` (a query-independent prefix slice), this picks the sentences
 * or bullets that actually match the query, wherever they sit in the segment, then re-emits them
 * in original document order so condition/action pairs stay coupled.
 *
 * When nothing in the segment's own text matches the query — e.g. it was selected because its
 * heading matched, not its body — this falls back to the parser's prefix preview, so that path
 * stays consistent with today's behaviour. When the heading matches but the body also has an
 * incidental, unrelated match (e.g. a locale code near the end of an otherwise irrelevant
 * segment), the segment's opening unit is kept alongside that match rather than dropped, since
 * that's the most likely place a heading-associated rule lives.
 */
export function buildSegmentExcerpt(input: {
  segment: KnowledgeMemorySegment;
  queryTokens: Set<string>;
  /**
   * Target locales for heading locale-marker matching (e.g. keep the opener under `### fr` for
   * `fr-FR`). Kept separate from queryTokens so bare language codes never rank body units.
   */
  inputLocales?: string[];
  maxChars: number;
  /**
   * Budget for the no-match fallback (segment.compactPromptText, used below when nothing in the
   * segment's own text matches the query) when it should differ from maxChars. Callers that
   * genuinely balance a shared budget across several selected segments (fallback/general modes)
   * want this fallback to respect that same share, same as maxChars — so they should leave this
   * unset. Callers with no real per-segment share (selective mode's common single/few-segment
   * case) may still pass a maxChars pre-shrunk to protect the match-centering paths below from a
   * later, corrupting outer re-trim; the no-match fallback doesn't center on anything and has no
   * such risk, so it can use its own larger budget here instead of inheriting that shrink.
   * Defaults to maxChars.
   */
  fallbackMaxChars?: number;
}): string {
  const { segment, queryTokens, maxChars } = input;
  const inputLocales = input.inputLocales ?? [];
  const fallbackMaxChars = input.fallbackMaxChars ?? maxChars;

  const units =
    segment.kind === "bullet_group"
      ? splitBulletUnits(segment.segmentText)
      : splitParagraphUnits(segment.segmentText);

  const { ranked, tokenWeights } = rankMatchingUnits(units, queryTokens);
  if (ranked.length === 0) {
    return truncateToBudget(segment.compactPromptText, fallbackMaxChars);
  }

  const rawHeadingPrefix = `${segment.headingPath.join(" > ")} -> `;
  // Reserve at least a sliver of body space even when the heading path is long relative to
  // maxChars (the 80-char minimum used for balanced multi-locale excerpts makes this easy to
  // hit): otherwise a long heading alone could consume the entire per-segment budget, returning
  // heading + "..." with none of the matched rule, and — when the heading alone is >= maxChars —
  // exceeding maxChars outright. A flat 20-char floor isn't actually enough on its own: up to 6 of
  // those go to truncateAroundMatch's own leading/trailing "..." markers, so a protected identifier
  // longer than ~14 characters (e.g. "routingtoken") could still get cut off mid-word. Size the
  // floor from the longest token actually being matched in this segment instead of a constant, via
  // minCharsToKeepSpanIntact (see its own comment for the geometry this is solved from). Uses the
  // longest raw matched span (see longestMatchedSpanLength), not the longest tokenWeights key: a
  // matched token containing an apostrophe is longer in the source text than its stripped map key.
  const minCharsForCenteredToken = minCharsToKeepSpanIntact(
    longestMatchedSpanLength(ranked, tokenWeights),
  );
  const minBodyReserve = Math.min(
    Math.max(20, minCharsForCenteredToken),
    Math.max(0, maxChars - 1),
  );
  const headingPrefix = truncateToBudget(rawHeadingPrefix, Math.max(0, maxChars - minBodyReserve));
  const separator = segment.kind === "bullet_group" ? "; " : " ";
  const bodyBudget = Math.max(0, maxChars - headingPrefix.length);

  // No special-case for an oversized top match: packUnitsWithinBudget's tryAddRankedUnit already
  // truncates any ranked unit that doesn't fit whole into whatever budget remains, the first one
  // included (remaining budget starts at the full bodyBudget when nothing's chosen yet). Special-
  // casing it here to bypass packing meant every other ranked unit was dropped outright, even a
  // short one that would fit alongside a truncated fragment of the top match.
  const unitsByOffset = new Map(units.map((unit) => [unit.offset, unit]));
  const firstUnit = unitsByOffset.get(0);
  const forcedFirstUnit =
    firstUnit &&
    !ranked.includes(firstUnit) &&
    headingMatchesQuery(segment, queryTokens, inputLocales)
      ? firstUnit
      : undefined;
  const chosen = packUnitsWithinBudget(
    ranked,
    unitsByOffset,
    bodyBudget,
    separator,
    forcedFirstUnit,
    queryTokens,
    tokenWeights,
  );
  const body = withNeighbourContext({
    body: chosen.map((unit) => unit.text).join(separator),
    segment,
    touchesStart: chosen[0]?.offset === 0,
    touchesEnd: chosen[chosen.length - 1]?.offset === units.length - 1,
    separator,
    bodyBudget,
  });

  return `${headingPrefix}${body}`;
}

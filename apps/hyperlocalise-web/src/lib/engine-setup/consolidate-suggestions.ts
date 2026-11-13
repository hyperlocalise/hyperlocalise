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
import type {
  EngineRuleCandidate,
  EngineSignalCandidates,
  EngineTermCandidate,
  EngineVoiceCandidate,
} from "./extract-engine-signals";
import { normalizeForMatch, type PageCorpusIndex } from "./page-corpus";
import type { EngineSuggestionDraft, EngineSuggestionEvidence } from "./types";

export const ENGINE_SETUP_MAX_TERMS = 60;
export const ENGINE_SETUP_MAX_RULES = 15;
export const ENGINE_SETUP_MAX_EVIDENCE = 3;
export const ENGINE_SETUP_VOICE_DEDUPE_KEY = "voice";
/** Heading the wizard owns inside knowledge memory. */
export const ENGINE_SETUP_VOICE_HEADING = "## Brand voice";
export const ENGINE_SETUP_RULES_HEADING = "## Style rules";

const SNIPPET_CONTEXT_CHARS = 60;
const TERM_COVERAGE_POINTS_PER_PAGE = 10;
const TERM_COVERAGE_MAX_POINTS = 40;
const TERM_MODEL_WEIGHT = 0.6;
const UNVERIFIED_VOICE_PENALTY = 20;

export type ExistingEngineContext = {
  // normalizeForMatch() of every term already in the target glossary.
  glossaryTermKeys: Set<string>;
  knowledgeContent: string;
};

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function verifiedEvidence(
  index: PageCorpusIndex,
  evidence: Array<{ pageIndex: number; snippet: string }>,
): EngineSuggestionEvidence[] {
  const seen = new Set<string>();
  const verified: EngineSuggestionEvidence[] = [];
  for (const entry of evidence) {
    const corpus = index.get(entry.pageIndex);
    if (!corpus || !index.pageContains(entry.pageIndex, entry.snippet)) continue;
    const key = `${corpus.url}\n${normalizeForMatch(entry.snippet)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push({ url: corpus.url, snippet: entry.snippet.trim() });
    if (verified.length >= ENGINE_SETUP_MAX_EVIDENCE) break;
  }
  return verified;
}

/** A short window of page text around the first match, for terms the model cited poorly. */
export function snippetAround(text: string, value: string): string | null {
  const haystack = text.toLowerCase();
  const position = haystack.indexOf(value.toLowerCase());
  if (position === -1) return null;
  const start = Math.max(0, position - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, position + value.length + SNIPPET_CONTEXT_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/gu, " ").trim()}${suffix}`;
}

function consolidateTerms(
  candidates: EngineTermCandidate[],
  index: PageCorpusIndex,
  existing: ExistingEngineContext,
): EngineSuggestionDraft[] {
  const byKey = new Map<string, EngineSuggestionDraft>();

  for (const candidate of candidates) {
    const dedupeKey = normalizeForMatch(candidate.term);
    if (!dedupeKey) continue;

    // Drop anything the model named that is not actually on the site.
    const pages = index.pagesContaining(candidate.term);
    if (pages.length === 0) continue;

    let evidence = verifiedEvidence(index, candidate.evidence);
    if (evidence.length === 0) {
      const corpus = index.get(pages[0]!);
      const snippet = corpus ? snippetAround(corpus.text, candidate.term) : null;
      evidence = corpus ? [{ url: corpus.url, snippet: snippet ?? candidate.term }] : [];
    }

    const coverage = Math.min(
      TERM_COVERAGE_MAX_POINTS,
      pages.length * TERM_COVERAGE_POINTS_PER_PAGE,
    );
    const confidence = clampConfidence(candidate.confidence * TERM_MODEL_WEIGHT + coverage);
    const previous = byKey.get(dedupeKey);
    if (previous && previous.confidence >= confidence) continue;

    byKey.set(dedupeKey, {
      kind: "term",
      dedupeKey,
      payload: {
        kind: "term",
        term: {
          term: candidate.term.trim(),
          termType: candidate.termType,
          translatable: candidate.translatable,
          definition: candidate.definition.trim(),
        },
      },
      evidence,
      confidence,
      conflict: existing.glossaryTermKeys.has(dedupeKey) ? "exists_in_glossary" : null,
    });
  }

  return [...byKey.values()]
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, ENGINE_SETUP_MAX_TERMS);
}

function consolidateRules(
  candidates: EngineRuleCandidate[],
  index: PageCorpusIndex,
  existing: ExistingEngineContext,
): EngineSuggestionDraft[] {
  const knowledge = normalizeForMatch(existing.knowledgeContent);
  const byKey = new Map<string, EngineSuggestionDraft>();

  for (const candidate of candidates) {
    const dedupeKey = normalizeForMatch(candidate.text);
    if (!dedupeKey || byKey.has(dedupeKey)) continue;

    // Rules are inferred, so they must point at real examples to be shown at all.
    const evidence = verifiedEvidence(index, candidate.evidence);
    if (evidence.length === 0) continue;

    byKey.set(dedupeKey, {
      kind: "rule",
      dedupeKey,
      payload: {
        kind: "rule",
        rule: { text: candidate.text.trim(), category: candidate.category },
      },
      evidence,
      confidence: clampConfidence(candidate.confidence),
      conflict: knowledge.includes(dedupeKey) ? "exists_in_knowledge" : null,
    });
  }

  return [...byKey.values()]
    .toSorted((a, b) => b.confidence - a.confidence)
    .slice(0, ENGINE_SETUP_MAX_RULES);
}

function uniqueTrimmed(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizeForMatch(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value.trim());
  }
  return result;
}

function consolidateVoice(
  candidate: EngineVoiceCandidate | null,
  index: PageCorpusIndex,
  existing: ExistingEngineContext,
): EngineSuggestionDraft | null {
  if (!candidate) return null;

  const evidence = verifiedEvidence(index, candidate.evidence);
  const confidence = clampConfidence(
    candidate.confidence - (evidence.length === 0 ? UNVERIFIED_VOICE_PENALTY : 0),
  );
  const hasVoiceSection = existing.knowledgeContent
    .split("\n")
    .some((line) => line.trim().toLowerCase() === ENGINE_SETUP_VOICE_HEADING.toLowerCase());

  return {
    kind: "voice",
    dedupeKey: ENGINE_SETUP_VOICE_DEDUPE_KEY,
    payload: {
      kind: "voice",
      voice: {
        summary: candidate.summary.trim(),
        attributes: {
          formality: clampConfidence(candidate.formality),
          playfulness: clampConfidence(candidate.playfulness),
          technicality: clampConfidence(candidate.technicality),
        },
        doSay: uniqueTrimmed(candidate.doSay),
        dontSay: uniqueTrimmed(candidate.dontSay),
      },
    },
    evidence,
    confidence,
    conflict: hasVoiceSection ? "exists_in_knowledge" : null,
  };
}

/**
 * Turns raw model candidates into reviewable suggestions: drops anything not
 * grounded in the crawled pages, dedupes, scores, and flags overlaps with what
 * the engine already knows.
 */
export function consolidateEngineSuggestions(input: {
  candidates: EngineSignalCandidates;
  index: PageCorpusIndex;
  existing: ExistingEngineContext;
}): EngineSuggestionDraft[] {
  const voice = consolidateVoice(input.candidates.voice, input.index, input.existing);
  return [
    ...(voice ? [voice] : []),
    ...consolidateRules(input.candidates.rules, input.index, input.existing),
    ...consolidateTerms(input.candidates.terms, input.index, input.existing),
  ];
}

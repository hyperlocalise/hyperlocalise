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

export const ENGINE_SETUP_DEFAULT_SOURCE_LOCALE = "en";

export type EngineSetupSourceKind = "website";

export type EngineSetupRunStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "blocked"
  | "applied";

export type EngineSetupProgressStage = "crawling" | "extracting" | "consolidating";

export type EngineSuggestionKind = "term" | "rule" | "voice";

export type EngineSuggestionStatus = "pending" | "accepted" | "rejected";

export type EngineSuggestionConflict = "exists_in_glossary" | "exists_in_knowledge";

export type EngineTermType = "brand" | "product" | "feature" | "domain";

export type EngineRuleCategory = "tone" | "formatting" | "grammar" | "terminology";

export type EngineTermPayload = {
  term: string;
  termType: EngineTermType;
  // False when the term must stay untranslated (brand and product names usually).
  translatable: boolean;
  definition: string;
};

export type EngineRulePayload = {
  text: string;
  category: EngineRuleCategory;
};

export type EngineVoiceAttributes = {
  // 0 = very casual, 100 = very formal.
  formality: number;
  // 0 = serious, 100 = playful.
  playfulness: number;
  // 0 = plain, 100 = technical.
  technicality: number;
};

export type EngineVoicePayload = {
  summary: string;
  attributes: EngineVoiceAttributes;
  doSay: string[];
  dontSay: string[];
};

export type EngineSuggestionPayload =
  | { kind: "term"; term: EngineTermPayload }
  | { kind: "rule"; rule: EngineRulePayload }
  | { kind: "voice"; voice: EngineVoicePayload };

export type EngineSuggestionEvidence = {
  url: string;
  snippet: string;
};

/** A consolidated suggestion ready to persist. */
export type EngineSuggestionDraft = {
  kind: EngineSuggestionKind;
  dedupeKey: string;
  payload: EngineSuggestionPayload;
  evidence: EngineSuggestionEvidence[];
  confidence: number;
  conflict: EngineSuggestionConflict | null;
};

export type EngineSetupEventData = {
  runId: string;
};

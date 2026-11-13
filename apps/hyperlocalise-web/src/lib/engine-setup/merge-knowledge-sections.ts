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
import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { ENGINE_SETUP_RULES_HEADING, ENGINE_SETUP_VOICE_HEADING } from "./consolidate-suggestions";
import { normalizeForMatch } from "./page-corpus";
import type { EngineRulePayload, EngineVoiceAttributes, EngineVoicePayload } from "./types";

const ATTRIBUTE_LOW_MAX = 33;
const ATTRIBUTE_HIGH_MIN = 67;

export type MergeKnowledgeSectionsError = { code: "content_too_long" };

type SectionRange = { start: number; end: number };

function findSection(lines: string[], heading: string): SectionRange | null {
  const target = heading.toLowerCase();
  const start = lines.findIndex((line) => line.trim().toLowerCase() === target);
  if (start === -1) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^#{1,2}\s/u.test(lines[index]!)) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function describeAttribute(score: number, low: string, high: string) {
  if (score <= ATTRIBUTE_LOW_MAX) return `${low} (${score}/100)`;
  if (score >= ATTRIBUTE_HIGH_MIN) return `${high} (${score}/100)`;
  return `balanced (${score}/100)`;
}

function renderAttributes(attributes: EngineVoiceAttributes) {
  return [
    `- Formality: ${describeAttribute(attributes.formality, "casual", "formal")}`,
    `- Playfulness: ${describeAttribute(attributes.playfulness, "serious", "playful")}`,
    `- Technicality: ${describeAttribute(attributes.technicality, "plain", "technical")}`,
  ];
}

export function renderVoiceSection(voice: EngineVoicePayload, sourceUrl: string): string[] {
  const lines = [
    ENGINE_SETUP_VOICE_HEADING,
    "",
    voice.summary,
    "",
    ...renderAttributes(voice.attributes),
  ];
  if (voice.doSay.length > 0) {
    lines.push("", "Sounds like:", ...voice.doSay.map((phrase) => `- "${phrase}"`));
  }
  if (voice.dontSay.length > 0) {
    lines.push("", "Avoid:", ...voice.dontSay.map((phrase) => `- "${phrase}"`));
  }
  lines.push("", `_Generated from ${sourceUrl} by the setup wizard._`, "");
  return lines;
}

function trimTrailingBlankLines(lines: string[]) {
  const result = [...lines];
  while (result.length > 0 && result.at(-1)!.trim() === "") result.pop();
  return result;
}

function appendSection(lines: string[], section: string[]) {
  const base = trimTrailingBlankLines(lines);
  return base.length === 0 ? section : [...base, "", ...section];
}

function mergeVoice(lines: string[], voice: EngineVoicePayload, sourceUrl: string) {
  const section = renderVoiceSection(voice, sourceUrl);
  const range = findSection(lines, ENGINE_SETUP_VOICE_HEADING);
  if (!range) return appendSection(lines, section);
  return [...lines.slice(0, range.start), ...section, ...lines.slice(range.end)];
}

function mergeRules(lines: string[], rules: EngineRulePayload[]) {
  const range = findSection(lines, ENGINE_SETUP_RULES_HEADING);
  const existingBody = range ? lines.slice(range.start + 1, range.end) : [];
  const existingKeys = new Set(
    existingBody
      .map((line) => line.replace(/^\s*[-*]\s+/u, ""))
      .map(normalizeForMatch)
      .filter(Boolean),
  );

  const additions: string[] = [];
  for (const rule of rules) {
    const key = normalizeForMatch(rule.text);
    if (!key || existingKeys.has(key)) continue;
    existingKeys.add(key);
    additions.push(`- ${rule.text}`);
  }
  if (additions.length === 0) return lines;

  if (!range) {
    return appendSection(lines, [ENGINE_SETUP_RULES_HEADING, "", ...additions, ""]);
  }
  const body = trimTrailingBlankLines(existingBody);
  const section = [
    lines[range.start]!,
    ...body,
    ...(body.length === 0 ? [""] : []),
    ...additions,
    "",
  ];
  return [...lines.slice(0, range.start), ...section, ...lines.slice(range.end)];
}

/**
 * Writes accepted voice and rules into the wizard-owned sections of a knowledge
 * memory document. The voice section is replaced; rules are appended without
 * duplicating bullets that are already there. Everything else is left as is.
 */
export function mergeEngineSetupKnowledge(input: {
  content: string;
  voice: EngineVoicePayload | null;
  rules: EngineRulePayload[];
  sourceUrl: string;
}): Result<string, MergeKnowledgeSectionsError> {
  let lines = input.content.length > 0 ? input.content.split("\n") : [];
  if (input.voice) {
    lines = mergeVoice(lines, input.voice, input.sourceUrl);
  }
  lines = mergeRules(lines, input.rules);

  const content = `${trimTrailingBlankLines(lines).join("\n")}\n`;
  if (content.length > KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH) {
    return err({ code: "content_too_long" });
  }
  return ok(content);
}

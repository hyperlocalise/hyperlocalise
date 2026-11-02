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

import { KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH } from "@/lib/knowledge-memory/knowledge-memory.shared";
import { isErr } from "@/lib/primitives/result/results";

import { mergeEngineSetupKnowledge } from "./merge-knowledge-sections";
import type { EngineVoicePayload } from "./types";

const voice: EngineVoicePayload = {
  summary: "Calm, direct and helpful.",
  attributes: { formality: 20, playfulness: 50, technicality: 80 },
  doSay: ["You stay in control."],
  dontSay: [],
};

function merged(input: Parameters<typeof mergeEngineSetupKnowledge>[0]) {
  const result = mergeEngineSetupKnowledge(input);
  if (isErr(result)) throw new Error(result.error.code);
  return result.value;
}

describe("mergeEngineSetupKnowledge", () => {
  it("creates voice and rules sections in empty knowledge memory", () => {
    expect(
      merged({
        content: "",
        voice,
        rules: [{ text: "Use sentence case for headings.", category: "formatting" }],
        sourceUrl: "https://acme.test/",
      }),
    ).toBe(
      [
        "## Brand voice",
        "",
        "Calm, direct and helpful.",
        "",
        "- Formality: casual (20/100)",
        "- Playfulness: balanced (50/100)",
        "- Technicality: technical (80/100)",
        "",
        "Sounds like:",
        '- "You stay in control."',
        "",
        "_Generated from https://acme.test/ by the setup wizard._",
        "",
        "## Style rules",
        "",
        "- Use sentence case for headings.",
        "",
      ].join("\n"),
    );
  });

  it("replaces only the voice section and keeps other content", () => {
    const content = [
      "# Memory",
      "",
      "## Brand voice",
      "",
      "Old voice.",
      "",
      "## Locale notes",
      "",
      "Use Australian English.",
    ].join("\n");

    const result = merged({ content, voice, rules: [], sourceUrl: "https://acme.test/" });

    expect(result).not.toContain("Old voice.");
    expect(result).toContain("Calm, direct and helpful.");
    expect(result.indexOf("## Brand voice")).toBeLessThan(result.indexOf("## Locale notes"));
    expect(result).toContain("Use Australian English.");
  });

  it("appends new rules without duplicating existing bullets", () => {
    const content = [
      "## Style rules",
      "",
      "- Use sentence case for headings.",
      "",
      "## Other",
      "",
      "Keep.",
    ].join("\n");

    const result = merged({
      content,
      voice: null,
      rules: [
        { text: "use sentence case  for headings.", category: "formatting" },
        { text: "Write numbers as numerals.", category: "formatting" },
      ],
      sourceUrl: "https://acme.test/",
    });

    expect(result).toBe(
      [
        "## Style rules",
        "",
        "- Use sentence case for headings.",
        "- Write numbers as numerals.",
        "",
        "## Other",
        "",
        "Keep.",
        "",
      ].join("\n"),
    );
  });

  it("is idempotent when applied twice", () => {
    const input = {
      content: "Intro.",
      voice,
      rules: [{ text: "Write numbers as numerals.", category: "formatting" as const }],
      sourceUrl: "https://acme.test/",
    };
    const once = merged(input);
    expect(merged({ ...input, content: once })).toBe(once);
  });

  it("refuses content over the knowledge memory limit", () => {
    const result = mergeEngineSetupKnowledge({
      content: "x".repeat(KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH),
      voice,
      rules: [],
      sourceUrl: "https://acme.test/",
    });
    expect(isErr(result) && result.error.code).toBe("content_too_long");
  });
});

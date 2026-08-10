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

import { KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH } from "./knowledge-memory.shared";
import { buildKnowledgeMemoryQueryTokens } from "./knowledge-memory-lexical-retriever";
import { selectKnowledgeMemoryContext } from "./knowledge-memory-selection";

describe("short UI string query tokens", () => {
  it("keeps OK/FAQ/Yes sourceText tokens while omitting dedicated locale fields", () => {
    for (const sourceText of ["OK", "FAQ", "Yes", "No", "CTA", "ID"]) {
      const tokens = buildKnowledgeMemoryQueryTokens({
        content: "# unused",
        targetLocale: "fr-FR",
        sourceText,
      });
      expect(tokens.has(sourceText.toLowerCase()), sourceText).toBe(true);
      expect(tokens.has("fr")).toBe(false);
      expect(tokens.has("fr-fr")).toBe(false);
    }
  });

  it("selectively retrieves OK-specific guidance for sourceText OK", () => {
    const content = [
      "# Memory.md",
      "",
      "## Button labels",
      "",
      'Always translate the OK button as "D\'accord" in product UI, never as "OK".',
      "",
      "## Brand voice",
      "",
      "Keep brand voice friendly across every surface.",
      "",
      "## Style guide",
      "",
      "Prefer short sentences and clear verbs.",
      "",
      "## Glossary",
      "",
      "Never translate the Hyperlocalise product name.",
      "",
      "## Tone",
      "",
      "Sound confident without sounding pushy.",
      "",
      ...Array.from(
        { length: 60 },
        (_, index) => `## Noise section ${index + 1}\n\nSupport operations archive ${index + 1}.`,
      ),
    ].join("\n");

    expect(content.length).toBeGreaterThan(KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH);

    const selected = selectKnowledgeMemoryContext({
      content,
      targetLocale: "fr-FR",
      sourceText: "OK",
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    expect(selected.compactText).toContain("D'accord");
    expect(selected.metrics.matchedHeadingPaths).toContain("Memory.md > Button labels");
  });
});

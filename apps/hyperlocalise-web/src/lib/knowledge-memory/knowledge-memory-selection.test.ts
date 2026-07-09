import { describe, expect, it } from "vite-plus/test";

import {
  KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH,
} from "./knowledge-memory.shared";
import { parseMarkdownMemory, selectKnowledgeMemoryContext } from "./knowledge-memory-selection";

const representativeMemory = `# Memory.md

## Locale notes

### en-AU

Use Australian English for customer-facing copy.

- Prefer colour, customise, localise, organise.
- Avoid US spelling.

### fr-FR

French marketing and pricing copy should sound natural, not directly translated.

- Avoid literal launch slogans.
- Prefer idiomatic French marketing phrasing.

## Brand voice

Hyperlocalise should sound practical, precise, and engineering-native.

- Avoid hype-heavy words like revolutionary and game-changing.

## Glossary

- Never translate "Hyperlocalise".
- Treat "TMS" as a product/industry acronym unless local convention says otherwise.
`;

function longRepresentativeMemory() {
  return [
    representativeMemory,
    "## Support guidance",
    "",
    ...Array.from({ length: 80 }, (_, index) => {
      return `- Support note ${index + 1}: keep operational troubleshooting copy calm, specific, and short.`;
    }),
  ].join("\n");
}

describe("parseMarkdownMemory", () => {
  it("creates heading-aware segments with parent and neighbour context", () => {
    const segments = parseMarkdownMemory(representativeMemory);
    const enAuBulletSegment = segments.find(
      (segment) =>
        segment.headingPath.join(" > ") === "Memory.md > Locale notes > en-AU" &&
        segment.kind === "bullet_group",
    );

    expect(enAuBulletSegment).toMatchObject({
      headingPath: ["Memory.md", "Locale notes", "en-AU"],
      startLine: 9,
      endLine: 10,
    });
    expect(enAuBulletSegment?.segmentText).toContain("Prefer colour");
    expect(enAuBulletSegment?.parentSectionPreview).toContain("Use Australian English");
    expect(enAuBulletSegment?.previousNeighbourText).toContain("Use Australian English");
    expect(enAuBulletSegment?.nextNeighbourText).toBeNull();
    expect(enAuBulletSegment?.compactPromptText).toContain(
      "Memory.md > Locale notes > en-AU -> Use Australian English",
    );
  });
});

describe("selectKnowledgeMemoryContext", () => {
  it.each([
    {
      name: "en-AU spelling from source color/customize",
      targetLocale: "en-AU",
      sourceText: "Customize your color settings",
      expectedContains: ["Australian English", "colour", "customise"],
      mustNotContain: ["fr-FR", "literal launch"],
    },
    {
      name: "fr-FR marketing copy",
      targetLocale: "fr-FR",
      sourceText: "Launch globally in days, not quarters",
      expectedContains: ["French", "natural", "literal"],
      mustNotContain: ["colour", "Australian English"],
    },
    {
      name: "brand voice hype avoidance",
      targetLocale: "en-US",
      sourceText: "A revolutionary localization workflow",
      expectedContains: ["hype-heavy", "revolutionary", "game-changing"],
      mustNotContain: ["fr-FR"],
    },
    {
      name: "product name glossary",
      targetLocale: "ja-JP",
      sourceText: "Start using Hyperlocalise",
      expectedContains: ["Never translate", "Hyperlocalise"],
      mustNotContain: ["colour"],
    },
  ])("retrieves expected guidance for $name", (testCase) => {
    const selected = selectKnowledgeMemoryContext({
      content: longRepresentativeMemory(),
      targetLocale: testCase.targetLocale,
      sourceText: testCase.sourceText,
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    for (const expected of testCase.expectedContains) {
      expect(selected.compactText).toContain(expected);
    }
    for (const forbidden of testCase.mustNotContain) {
      expect(selected.compactText).not.toContain(forbidden);
    }
    expect(selected.compactText).not.toBe("Avoid US spelling.");
  });

  it("reduces selected prompt text compared with the whole memory on a long fixture", () => {
    const content = longRepresentativeMemory();
    const selected = selectKnowledgeMemoryContext({
      content,
      targetLocale: "en-AU",
      sourceText: "Customize your color settings",
    });

    expect(selected.metrics.wholeMemoryChars).toBe(content.trim().length);
    expect(selected.metrics.selectedMemoryChars).toBeLessThan(selected.metrics.wholeMemoryChars);
    expect(selected.metrics.reductionPercent).toBeGreaterThan(50);
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
    expect(selected.metrics.matchedHeadingPaths).toContain("Memory.md > Locale notes > en-AU");
  });

  it("keeps current whole-memory behavior for small memory", () => {
    const content = "Always keep Hyperlocalise untranslated.";
    const selected = selectKnowledgeMemoryContext({
      content,
      targetLocale: "fr-FR",
      sourceText: "Start using Hyperlocalise",
    });

    expect(content.length).toBeLessThan(KNOWLEDGE_MEMORY_SMALL_CONTENT_MAX_LENGTH);
    expect(selected.compactText).toBe(content);
    expect(selected.metrics).toMatchObject({
      fallbackMode: "whole_small",
      selectedMemoryCount: 0,
      reductionPercent: 0,
    });
  });

  it("returns empty selected context for empty memory", () => {
    const selected = selectKnowledgeMemoryContext({
      content: "",
      targetLocale: "en-AU",
      sourceText: "Customize your color settings",
    });

    expect(selected.compactText).toBe("");
    expect(selected.metrics.fallbackMode).toBe("empty");
  });

  it("does not crash on malformed markdown and falls back safely", () => {
    const selected = selectKnowledgeMemoryContext({
      content: "## [Broken\n\n- Still readable\n- Another note\n\n".repeat(80),
      targetLocale: "de-DE",
      sourceText: "Unrelated source",
    });

    expect(["general", "none", "selective"]).toContain(selected.metrics.fallbackMode);
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });
});

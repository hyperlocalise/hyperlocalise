import { describe, expect, it } from "vite-plus/test";

import {
  KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS,
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

function unrelatedLongMemoryWithoutGeneralHeading() {
  return [
    "# Memory.md",
    "",
    "## Brand voice",
    "",
    "Sound calm, useful, and precise across every translated surface.",
    "",
    "## Glossary",
    "",
    "- Keep Hyperlocalise unchanged.",
    "- Keep API unchanged unless a local convention requires expansion.",
    "",
    ...Array.from({ length: 90 }, (_, index) =>
      [
        `## Operations note ${index + 1}`,
        "",
        `Archive note ${index + 1} for internal process copy.`,
      ].join("\n"),
    ),
  ].join("\n");
}

function multiLocaleMemoryWithDistractors() {
  return [
    "# Memory.md",
    "",
    "## French payment voice",
    "",
    "### fr-FR",
    "",
    "Use formal French for payment confirmation and billing messages.",
    "",
    ...Array.from({ length: 5 }, (_, index) =>
      [
        `## Generic payment note ${index + 1}`,
        "",
        "Payment confirmation copy should stay short and direct.",
      ].join("\n"),
    ),
    "",
    "## Australian checkout voice",
    "",
    "### en-AU",
    "",
    "Use Australian English spelling and retail phrasing for this locale.",
    "",
    ...Array.from(
      { length: 70 },
      (_, index) => `## Noise section ${index + 1}\n\nSupport operations archive ${index + 1}.`,
    ),
  ].join("\n");
}

function multiSubtagLocaleMemoryWithDistractors() {
  return [
    "# Memory.md",
    "",
    "## French payment voice",
    "",
    "### fr-FR",
    "",
    "Use formal French for payment confirmation and billing messages.",
    "",
    ...Array.from({ length: 5 }, (_, index) =>
      [
        `## Generic payment note ${index + 1}`,
        "",
        "Payment confirmation copy should stay short and direct.",
      ].join("\n"),
    ),
    "",
    "## Simplified Chinese checkout voice",
    "",
    "### zh-Hans-CN",
    "",
    "Use Simplified Chinese locale conventions for this locale.",
    "",
    ...Array.from(
      { length: 70 },
      (_, index) => `## Noise section ${index + 1}\n\nSupport operations archive ${index + 1}.`,
    ),
  ].join("\n");
}

function sixLocaleMemoryWithMatchingSections() {
  return longLocaleMemoryWithMatchingSections([
    "en-AU",
    "fr-FR",
    "de-DE",
    "es-ES",
    "ja-JP",
    "pt-BR",
  ]);
}

function fiveLocaleMemoryWithMatchingSections() {
  return longLocaleMemoryWithMatchingSections(["en-AU", "fr-FR", "de-DE", "es-ES", "ja-JP"]);
}

function longLocaleMemoryWithMatchingSections(locales: string[]) {
  return [
    "# Memory.md",
    "",
    "## Locale guidance",
    "",
    ...locales.flatMap((locale) => [
      `### ${locale}`,
      "",
      [
        `Use ${locale} payment confirmation guidance for checkout copy.`,
        ...Array.from(
          { length: 18 },
          (_, index) =>
            `${locale} checkout note ${index + 1}: keep payment timing, card wording, and confirmation copy precise.`,
        ),
      ].join(" "),
      "",
    ]),
    ...Array.from(
      { length: 70 },
      (_, index) => `## Noise section ${index + 1}\n\nSupport operations archive ${index + 1}.`,
    ),
  ].join("\n");
}

function extensionLocaleMemoryWithDistractors() {
  return [
    "# Memory.md",
    "",
    "## Calendar preference",
    "",
    "### en-US-u-hc-h12",
    "",
    "Use twelve-hour clock wording for checkout confirmations.",
    "",
    "## Formal German",
    "",
    "### de-DE-x-formal",
    "",
    "Use formal German address for checkout confirmations.",
    "",
    ...Array.from(
      { length: 10 },
      (_, index) =>
        `## Generic payment note ${index + 1}\n\nPayment confirmation copy should stay short.`,
    ),
    ...Array.from(
      { length: 70 },
      (_, index) => `## Noise section ${index + 1}\n\nSupport operations archive ${index + 1}.`,
    ),
  ].join("\n");
}

function longHeadingOnlyMemory() {
  return [
    "# Memory.md",
    "",
    ...Array.from(
      { length: 140 },
      (_, index) => `## Locale rule outline ${index + 1}: keep protected token TOKEN-${index + 1}`,
    ),
  ].join("\n");
}

function mixedHeadingOnlyGuidanceMemory() {
  return [
    "# Memory.md",
    "",
    "## Brand voice - Sound practical and precise",
    "",
    "## Tone - Avoid hype-heavy launch copy",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
  ].join("\n");
}

function lateHeadingOnlyGuidanceMemory() {
  return [
    "# Memory.md",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
    "",
    "## Protected token rule - Never translate SKU-LATE",
    "",
    "## Locale rule - Use formal voice for es-ES checkout",
  ].join("\n");
}

function paymentRulesFallbackMemory() {
  return [
    "# Memory.md",
    "",
    "## Payment rules",
    "",
    "Use concise payment wording and keep card-network names unchanged.",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
  ].join("\n");
}

function checkoutCopyFallbackMemory() {
  return [
    "# Memory.md",
    "",
    "## Checkout copy",
    "",
    "Keep card confirmation wording short and mention payment timing plainly.",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
  ].join("\n");
}

function generalWithLaterRulesMemory() {
  return [
    "# Memory.md",
    "",
    "## General",
    "",
    "Use clear product copy across all locales.",
    "",
    "## Payment rules",
    "",
    "Keep settlement timing explicit and preserve card-network names.",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
  ].join("\n");
}

function generalWithManyPreferredSectionsMemory() {
  return [
    "# Memory.md",
    "",
    "## General",
    "",
    "Apply the saved workspace guidance before narrower rules.",
    "",
    "## Brand voice - Never translate SKU-GENERAL-HEADING",
    "",
    "## Brand voice",
    "",
    "Keep brand copy practical and precise.",
    "",
    "## Glossary",
    "",
    "Keep Hyperlocalise unchanged.",
    "",
    "## Protected tokens",
    "",
    "Never translate SKU-GENERAL.",
    "",
    "## Locale rules",
    "",
    "Use local checkout conventions.",
    "",
    "## Tone",
    "",
    "Avoid hype-heavy launch copy.",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
  ].join("\n");
}

function preferredFallbackWithHeadingOnlySiblingsMemory() {
  return [
    "# Memory.md",
    "",
    "## Protected tokens",
    "",
    "Never translate SKU-HEADING-ONLY.",
    "",
    "## Design principles",
    "",
    "## Implementation guidelines",
    "",
    ...Array.from(
      { length: 90 },
      (_, index) => `## Operations note ${index + 1}\n\nInternal archive note ${index + 1}.`,
    ),
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

  it("falls back to broadly useful sections instead of dropping long memories", () => {
    const selected = selectKnowledgeMemoryContext({
      content: unrelatedLongMemoryWithoutGeneralHeading(),
      targetLocale: "de-DE",
      sourceText: "Save changes",
    });

    expect(selected.compactText).toContain("Brand voice");
    expect(selected.compactText).toContain("Glossary");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeGreaterThan(0);
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("falls back to raw markdown when long non-empty memory has no selectable segments", () => {
    const selected = selectKnowledgeMemoryContext({
      content: longHeadingOnlyMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Locale rule outline 1");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeGreaterThan(0);
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps heading-only guidance when other sections have body text", () => {
    const selected = selectKnowledgeMemoryContext({
      content: mixedHeadingOnlyGuidanceMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Brand voice - Sound practical and precise");
    expect(selected.compactText).toContain("Tone - Avoid hype-heavy launch copy");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps later heading-only guidance outside the raw prefix fallback", () => {
    const selected = selectKnowledgeMemoryContext({
      content: lateHeadingOnlyGuidanceMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Protected token rule - Never translate SKU-LATE");
    expect(selected.compactText).toContain("Locale rule - Use formal voice for es-ES checkout");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps fallback section body text for useful rule headings", () => {
    const selected = selectKnowledgeMemoryContext({
      content: paymentRulesFallbackMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Memory.md > Payment rules");
    expect(selected.compactText).toContain("concise payment wording");
    expect(selected.compactText).toContain("card-network names unchanged");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps heading-only siblings when a preferred fallback section has body text", () => {
    const selected = selectKnowledgeMemoryContext({
      content: preferredFallbackWithHeadingOnlySiblingsMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Memory.md heading fallback:");
    expect(selected.compactText).toContain("Protected tokens");
    expect(selected.compactText).toContain("Never translate SKU-HEADING-ONLY");
    expect(selected.compactText).toContain("Design principles");
    expect(selected.compactText).toContain("Implementation guidelines");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps representative body text in the final parsed fallback", () => {
    const selected = selectKnowledgeMemoryContext({
      content: checkoutCopyFallbackMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Memory.md > Checkout copy");
    expect(selected.compactText).toContain("card confirmation wording");
    expect(selected.compactText).toContain("payment timing plainly");
    expect(selected.metrics.fallbackMode).toBe("fallback");
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps general fallback plus later representative sections", () => {
    const selected = selectKnowledgeMemoryContext({
      content: generalWithLaterRulesMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Memory.md > General");
    expect(selected.compactText).toContain("clear product copy");
    expect(selected.compactText).toContain("Memory.md > Payment rules");
    expect(selected.compactText).toContain("settlement timing explicit");
    expect(selected.metrics.fallbackMode).toBe("general");
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("keeps the general fallback anchor when many preferred sections compete", () => {
    const selected = selectKnowledgeMemoryContext({
      content: generalWithManyPreferredSectionsMemory(),
      targetLocale: "es-ES",
      sourceText: "Unrelated source text",
    });

    expect(selected.compactText).toContain("Memory.md > General");
    expect(selected.compactText).toContain("saved workspace guidance");
    expect(selected.compactText).toContain("Brand voice - Never translate SKU-GENERAL-HEADING");
    expect(selected.metrics.fallbackMode).toBe("general");
    expect(selected.metrics.matchedHeadingPaths[0]).toBe("Memory.md > General");
    expect(selected.metrics.selectedMemoryCount).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_MAX_SELECTED_SEGMENTS,
    );
  });

  it("boosts every target locale in multi-target memory selection", () => {
    const selected = selectKnowledgeMemoryContext({
      content: multiLocaleMemoryWithDistractors(),
      targetLocales: ["fr-FR", "en-AU"],
      sourceText: "Payment confirmation",
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    expect(selected.metrics.matchedHeadingPaths).toContain(
      "Memory.md > French payment voice > fr-FR",
    );
    expect(selected.metrics.matchedHeadingPaths).toContain(
      "Memory.md > Australian checkout voice > en-AU",
    );
  });

  it("boosts multi-subtag locale tags in memory selection", () => {
    const selected = selectKnowledgeMemoryContext({
      content: multiSubtagLocaleMemoryWithDistractors(),
      targetLocales: ["fr-FR", "zh-Hans-CN"],
      sourceText: "Payment confirmation",
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    expect(selected.metrics.matchedHeadingPaths).toContain(
      "Memory.md > French payment voice > fr-FR",
    );
    expect(selected.metrics.matchedHeadingPaths).toContain(
      "Memory.md > Simplified Chinese checkout voice > zh-Hans-CN",
    );
  });

  it("keeps one matched section per requested target locale when more than five locales match", () => {
    const targetLocales = ["en-AU", "fr-FR", "de-DE", "es-ES", "ja-JP", "pt-BR"];
    const selected = selectKnowledgeMemoryContext({
      content: sixLocaleMemoryWithMatchingSections(),
      targetLocales,
      sourceText: "Payment confirmation",
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    for (const locale of targetLocales) {
      expect(selected.metrics.matchedHeadingPaths).toContain(
        `Memory.md > Locale guidance > ${locale}`,
      );
    }
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("balances long snippets when exactly five target locales match", () => {
    const targetLocales = ["en-AU", "fr-FR", "de-DE", "es-ES", "ja-JP"];
    const selected = selectKnowledgeMemoryContext({
      content: fiveLocaleMemoryWithMatchingSections(),
      targetLocales,
      sourceText: "Payment confirmation",
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    for (const locale of targetLocales) {
      expect(selected.metrics.matchedHeadingPaths).toContain(
        `Memory.md > Locale guidance > ${locale}`,
      );
    }
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("boosts locale tags with extension and private-use subtags", () => {
    const selected = selectKnowledgeMemoryContext({
      content: extensionLocaleMemoryWithDistractors(),
      targetLocales: ["en_US_u_hc_h12", "de_DE_x_formal"],
      sourceText: "Checkout confirmation",
    });

    expect(selected.metrics.fallbackMode).toBe("selective");
    expect(selected.metrics.matchedHeadingPaths).toContain(
      "Memory.md > Calendar preference > en-US-u-hc-h12",
    );
    expect(selected.metrics.matchedHeadingPaths).toContain(
      "Memory.md > Formal German > de-DE-x-formal",
    );
  });

  it("does not crash on malformed markdown and falls back safely", () => {
    const selected = selectKnowledgeMemoryContext({
      content: "## [Broken\n\n- Still readable\n- Another note\n\n".repeat(80),
      targetLocale: "de-DE",
      sourceText: "Unrelated source",
    });

    expect(["general", "none", "selective", "fallback"]).toContain(selected.metrics.fallbackMode);
    expect(selected.metrics.selectedMemoryChars).toBeLessThanOrEqual(
      KNOWLEDGE_MEMORY_SELECTED_CONTEXT_MAX_LENGTH,
    );
  });

  it("allows the retrieval algorithm to be replaced without changing selection assembly", () => {
    const selected = selectKnowledgeMemoryContext(
      {
        content: longRepresentativeMemory(),
        targetLocale: "en-AU",
        sourceText: "Customize your color settings",
      },
      {
        retrieveSegments: ({ segments }) => {
          const brandVoiceSegment = segments.find(
            (segment) => segment.headingPath.join(" > ") === "Memory.md > Brand voice",
          );
          return brandVoiceSegment ? [{ segment: brandVoiceSegment, score: 100 }] : [];
        },
      },
    );

    expect(selected.metrics.fallbackMode).toBe("selective");
    expect(selected.metrics.matchedHeadingPaths).toEqual(["Memory.md > Brand voice"]);
    expect(selected.compactText).toContain("engineering-native");
  });
});

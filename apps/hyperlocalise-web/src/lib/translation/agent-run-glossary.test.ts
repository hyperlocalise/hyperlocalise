import { describe, expect, it } from "vite-plus/test";

import {
  countGlossaryMatchesInUsage,
  formatGlossaryMatchSourceLabel,
  formatGlossaryResourceLabel,
  formatGlossaryTermStatusLabel,
  parseGlossaryUsageFromOutputSummary,
} from "./agent-run-glossary";

describe("parseGlossaryUsageFromOutputSummary", () => {
  it("parses run-level glossary usage", () => {
    const usage = parseGlossaryUsageFromOutputSummary({
      glossaryUsage: [
        {
          externalStringId: "s1",
          key: "welcome.title",
          matches: [
            {
              glossaryId: "glossary-1",
              glossaryName: "Product glossary",
              sourceTerm: "Save",
              targetTerm: "Enregistrer",
              targetLocale: "fr",
              forbidden: false,
              preferred: true,
              matchSource: "synced_database",
              providerKind: "crowdin",
              resourceId: "glossary-1",
              externalResourceId: "42",
            },
          ],
        },
      ],
    });

    expect(usage).toHaveLength(1);
    expect(countGlossaryMatchesInUsage(usage)).toBe(1);
  });

  it("returns null when usage is missing or empty", () => {
    expect(parseGlossaryUsageFromOutputSummary(undefined)).toBeNull();
    expect(parseGlossaryUsageFromOutputSummary({})).toBeNull();
    expect(parseGlossaryUsageFromOutputSummary({ glossaryUsage: [] })).toBeNull();
  });
});

describe("formatGlossaryMatchSourceLabel", () => {
  it("labels synced and live provider sources", () => {
    expect(
      formatGlossaryMatchSourceLabel({
        matchSource: "synced_database",
        providerKind: "crowdin",
      }),
    ).toBe("Synced database");

    expect(
      formatGlossaryMatchSourceLabel({
        matchSource: "live_provider",
        providerKind: "crowdin",
      }),
    ).toBe("Live crowdin");
  });

  it("includes external resource id in resource label when present", () => {
    expect(
      formatGlossaryResourceLabel({
        glossaryId: "glossary-1",
        glossaryName: "Glossary",
        sourceTerm: "A",
        targetTerm: "B",
        targetLocale: "fr",
        forbidden: false,
        preferred: true,
        matchSource: "live_provider",
        providerKind: "crowdin",
        resourceId: "glossary-1",
        externalResourceId: "99",
      }),
    ).toContain("Glossary 99");
  });

  it("labels preferred and forbidden term status", () => {
    expect(
      formatGlossaryTermStatusLabel({
        glossaryId: "glossary-1",
        glossaryName: "Glossary",
        sourceTerm: "A",
        targetTerm: "B",
        targetLocale: "fr",
        forbidden: false,
        preferred: true,
        matchSource: "synced_database",
        providerKind: null,
        resourceId: "glossary-1",
        externalResourceId: null,
      }),
    ).toBe("Preferred");

    expect(
      formatGlossaryTermStatusLabel({
        glossaryId: "glossary-1",
        glossaryName: "Glossary",
        sourceTerm: "A",
        targetTerm: "B",
        targetLocale: "fr",
        forbidden: true,
        preferred: false,
        matchSource: "synced_database",
        providerKind: null,
        resourceId: "glossary-1",
        externalResourceId: null,
      }),
    ).toBe("Forbidden");
  });
});

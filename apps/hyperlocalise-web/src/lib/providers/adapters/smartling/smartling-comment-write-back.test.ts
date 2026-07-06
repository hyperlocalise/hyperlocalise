import { describe, expect, it } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";

import {
  buildHyperlocaliseFindingMarker,
  buildSmartlingCommentWriteBackEntries,
  mapProviderSeverityToSmartling,
  parseHyperlocaliseFindingMarker,
} from "./smartling-provider";

function sampleFinding(overrides?: Partial<ProviderQaFinding>): ProviderQaFinding {
  return {
    checkType: "glossary_violation",
    severity: "warning",
    message: "Term mismatch",
    suggestedFix: "Use approved glossary term",
    confidence: 0.92,
    item: {
      externalStringId: "hash-abc",
      key: "welcome.title",
      locale: "fr-FR",
      field: "target",
    },
    ...overrides,
  };
}

describe("smartling-comment-write-back", () => {
  it("round-trips hyperlocalise finding markers in issue text", () => {
    const findingId = "finding-123";
    const marker = buildHyperlocaliseFindingMarker(findingId);

    expect(marker).toBe("[hyperlocalise:finding=finding-123]");
    expect(parseHyperlocaliseFindingMarker(marker)).toBe(findingId);
    expect(parseHyperlocaliseFindingMarker("no marker here")).toBeNull();
  });

  it("maps provider severities to Smartling severity codes", () => {
    expect(mapProviderSeverityToSmartling("error")).toBe("HIGH");
    expect(mapProviderSeverityToSmartling("warning")).toBe("MEDIUM");
    expect(mapProviderSeverityToSmartling("info")).toBe("LOW");
  });

  it("builds issue templates with markers and metadata", () => {
    const finding = sampleFinding();
    const { entries, failures } = buildSmartlingCommentWriteBackEntries({
      findings: [finding],
      defaultLocaleId: null,
    });

    expect(failures).toEqual([]);
    expect(entries).toHaveLength(1);

    const findingId = buildFindingId(finding);
    expect(entries[0]?.findingId).toBe(findingId);
    expect(entries[0]?.issueTemplate).toMatchObject({
      string: { hashcode: "hash-abc", localeId: "fr-FR" },
      issueTypeCode: "REVIEW",
      issueSeverityLevelCode: "MEDIUM",
    });
    expect(entries[0]?.issueTemplate.issueText).toContain(
      buildHyperlocaliseFindingMarker(findingId),
    );
    expect(entries[0]?.issueTemplate.issueText).toContain("[glossary_violation] Term mismatch");
    expect(entries[0]?.issueTemplate.issueText).toContain("Suggested fix:");
    expect(entries[0]?.issueTemplate.issueText).toContain("Confidence: 0.92");
  });

  it("records validation failures for missing hashcode or locale", () => {
    const missingHash = sampleFinding({
      item: { externalStringId: "  ", key: "k1", locale: "fr-FR" },
    });
    const missingLocale = sampleFinding({
      item: { externalStringId: "hash-1", key: "k2" },
    });

    const { entries, failures } = buildSmartlingCommentWriteBackEntries({
      findings: [missingHash, missingLocale],
      defaultLocaleId: null,
    });

    expect(entries).toEqual([]);
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "smartling_comment_missing_hashcode" }),
        expect.objectContaining({ message: "smartling_comment_missing_locale" }),
      ]),
    );
  });

  it("falls back to default locale when finding locale is absent", () => {
    const finding = sampleFinding({
      item: { externalStringId: "hash-1", key: "k1" },
    });

    const { entries, failures } = buildSmartlingCommentWriteBackEntries({
      findings: [finding],
      defaultLocaleId: "de-DE",
    });

    expect(failures).toEqual([]);
    expect(entries[0]?.issueTemplate.string.localeId).toBe("de-DE");
  });
});

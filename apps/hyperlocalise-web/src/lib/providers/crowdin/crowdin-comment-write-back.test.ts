import { describe, expect, it } from "vite-plus/test";

import { buildFindingId } from "@/lib/providers/provider-job-qa/build-finding-id";
import type { ProviderQaFinding } from "@/lib/providers/provider-job-qa/types";
import { buildHyperlocaliseFindingMarker } from "@/lib/providers/smartling/smartling-comment-write-back";

import {
  buildCrowdinCommentWriteBackEntries,
  mapProviderSeverityToCrowdinIssueType,
} from "./crowdin-comment-write-back";

function sampleFinding(overrides?: Partial<ProviderQaFinding>): ProviderQaFinding {
  return {
    checkType: "glossary_violation",
    severity: "warning",
    message: "Term mismatch",
    suggestedFix: "Use approved glossary term",
    confidence: 0.92,
    item: {
      externalStringId: "100",
      key: "welcome.title",
      locale: "fr",
      field: "target",
    },
    ...overrides,
  };
}

describe("crowdin-comment-write-back", () => {
  it("maps provider severities to Crowdin issue types", () => {
    expect(mapProviderSeverityToCrowdinIssueType("error")).toBe("translation_mistake");
    expect(mapProviderSeverityToCrowdinIssueType("warning")).toBe("general_question");
    expect(mapProviderSeverityToCrowdinIssueType("info")).toBe("context_request");
  });

  it("builds issue requests with markers and metadata", () => {
    const finding = sampleFinding();
    const { entries, failures } = buildCrowdinCommentWriteBackEntries({
      findings: [finding],
      defaultLocaleId: null,
    });

    expect(failures).toEqual([]);
    expect(entries).toHaveLength(1);

    const findingId = buildFindingId(finding);
    expect(entries[0]?.findingId).toBe(findingId);
    expect(entries[0]?.request).toMatchObject({
      stringId: 100,
      targetLanguageId: "fr",
      type: "issue",
      issueType: "general_question",
    });
    expect(entries[0]?.request.text).toContain(buildHyperlocaliseFindingMarker(findingId));
    expect(entries[0]?.request.text).toContain("[glossary_violation] Term mismatch");
    expect(entries[0]?.request.text).toContain("Suggested fix:");
    expect(entries[0]?.request.text).toContain("Confidence: 0.92");
  });

  it("records validation failures for missing string id or locale", () => {
    const missingStringId = sampleFinding({
      item: { externalStringId: "  ", key: "k1", locale: "fr" },
    });
    const missingLocale = sampleFinding({
      item: { externalStringId: "100", key: "k2" },
    });

    const { entries, failures } = buildCrowdinCommentWriteBackEntries({
      findings: [missingStringId, missingLocale],
      defaultLocaleId: null,
    });

    expect(entries).toEqual([]);
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "crowdin_comment_missing_string_id" }),
        expect.objectContaining({ message: "crowdin_comment_missing_locale" }),
      ]),
    );
  });

  it("falls back to default locale when finding locale is absent", () => {
    const finding = sampleFinding({
      item: { externalStringId: "100", key: "k1" },
    });

    const { entries, failures } = buildCrowdinCommentWriteBackEntries({
      findings: [finding],
      defaultLocaleId: "de",
    });

    expect(failures).toEqual([]);
    expect(entries[0]?.request.targetLanguageId).toBe("de");
  });
});

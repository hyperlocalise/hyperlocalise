import { describe, expect, it } from "vite-plus/test";

import {
  mapHlFindingToProviderFinding,
  mapHlCheckReportToProviderFindings,
} from "./map-hl-findings";

const manifest = {
  greeting: { externalStringId: "ext-1", key: "greeting" },
};

describe("mapHlFindingToProviderFinding", () => {
  it("maps placeholder_mismatch with full confidence", () => {
    const finding = mapHlFindingToProviderFinding(
      {
        type: "placeholder_mismatch",
        severity: "error",
        locale: "fr",
        sourceFile: "content/en/strings.json",
        targetFile: "content/fr/strings.json",
        key: "greeting",
        message: "Placeholder mismatch",
      },
      manifest,
      "en",
    );

    expect(finding).toMatchObject({
      checkType: "placeholder_mismatch",
      severity: "error",
      confidence: 1,
      suggestedFix: expect.stringContaining("placeholders"),
      item: {
        externalStringId: "ext-1",
        key: "greeting",
        locale: "fr",
        field: "target",
      },
    });
  });

  it("maps same_as_source to tone_style_issue with slightly lower confidence", () => {
    const finding = mapHlFindingToProviderFinding(
      {
        type: "same_as_source",
        severity: "warning",
        locale: "fr",
        sourceFile: "content/en/strings.json",
        targetFile: "content/fr/strings.json",
        key: "greeting",
        message: "Target matches source",
      },
      manifest,
      "en",
    );

    expect(finding).toMatchObject({
      checkType: "tone_style_issue",
      severity: "warning",
      confidence: 0.95,
    });
  });

  it("maps whitespace_only to whitespace_only_translation", () => {
    const finding = mapHlFindingToProviderFinding(
      {
        type: "whitespace_only",
        severity: "info",
        locale: "fr",
        sourceFile: "content/en/strings.json",
        targetFile: "content/fr/strings.json",
        key: "greeting",
        message: "Whitespace only",
      },
      manifest,
      "en",
    );

    expect(finding?.checkType).toBe("whitespace_only_translation");
    expect(finding?.confidence).toBe(1);
  });

  it("returns null for unmapped hl check types", () => {
    const finding = mapHlFindingToProviderFinding(
      {
        type: "orphaned_key",
        severity: "error",
        sourceFile: "content/en/strings.json",
        key: "greeting",
      },
      manifest,
      "en",
    );

    expect(finding).toBeNull();
  });

  it("returns null when manifest entry is missing", () => {
    const finding = mapHlFindingToProviderFinding(
      {
        type: "not_localized",
        severity: "error",
        locale: "fr",
        sourceFile: "content/en/strings.json",
        targetFile: "content/fr/strings.json",
        key: "missing-key",
        message: "Missing",
      },
      manifest,
      "en",
    );

    expect(finding).toBeNull();
  });
});

describe("mapHlCheckReportToProviderFindings", () => {
  it("normalizes all mapped findings in a report", () => {
    const findings = mapHlCheckReportToProviderFindings({
      report: {
        checks: ["not_localized", "same_as_source"],
        findings: [
          {
            type: "not_localized",
            severity: "error",
            locale: "fr",
            sourceFile: "content/en/strings.json",
            targetFile: "content/fr/strings.json",
            key: "greeting",
            message: "Missing translation",
          },
          {
            type: "same_as_source",
            severity: "warning",
            locale: "fr",
            sourceFile: "content/en/strings.json",
            targetFile: "content/fr/strings.json",
            key: "greeting",
            message: "Same as source",
          },
        ],
        summary: { total: 2 },
      },
      manifest,
      sourceLocale: "en",
    });

    expect(findings).toHaveLength(2);
    expect(findings[0]?.checkType).toBe("missing_translation");
    expect(findings[0]?.confidence).toBe(1);
    expect(findings[1]?.checkType).toBe("tone_style_issue");
    expect(findings[1]?.confidence).toBe(0.95);
  });
});

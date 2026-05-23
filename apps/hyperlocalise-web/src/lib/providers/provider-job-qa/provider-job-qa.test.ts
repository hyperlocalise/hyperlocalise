import { describe, expect, it, vi } from "vite-plus/test";

import type { ExternalTmsTranslationUnit } from "@/lib/providers/external-tms-content-sync";

import type { HlCheckReport } from "./hl-check-types";
import { collectSupplementalQaFindings } from "./supplemental-checks";
import { runProviderJobQa } from "./run-provider-job-qa";

function unit(overrides: Partial<ExternalTmsTranslationUnit> = {}): ExternalTmsTranslationUnit {
  return {
    externalStringId: "1",
    key: "greeting",
    sourceText: "Hello {name}",
    translations: [],
    ...overrides,
  };
}

const baseOptions = {
  targetLocales: ["fr"],
  glossaryTerms: [],
  sourceLocale: "en",
};

const mockHlReport = vi.hoisted(() => vi.fn<() => Promise<HlCheckReport>>());

vi.mock("./run-hl-check", () => ({
  runHlCheckOnProviderContent: vi.fn(async () => ({
    report: await mockHlReport(),
    keyManifest: {
      greeting: { externalStringId: "1", key: "greeting" },
    },
    workspaceRoot: "/tmp/hl-provider-qa",
  })),
}));

describe("runProviderJobQa via hl check", () => {
  it("maps hl placeholder_mismatch findings", async () => {
    mockHlReport.mockResolvedValue({
      checks: ["placeholder_mismatch"],
      findings: [
        {
          type: "placeholder_mismatch",
          severity: "error",
          locale: "fr",
          sourceFile: "content/en/strings.json",
          targetFile: "content/fr/strings.json",
          key: "greeting",
          message: "Placeholder mismatch",
        },
      ],
      summary: { total: 1 },
    });

    const report = await runProviderJobQa(
      {
        externalJobId: "job-1",
        targetLocales: ["fr"],
        units: [
          unit({ sourceText: "Hello {name}", translations: [{ locale: "fr", text: "Bonjour" }] }),
        ],
      },
      baseOptions,
    );

    expect(report.findings.some((finding) => finding.checkType === "placeholder_mismatch")).toBe(
      true,
    );
  });

  it("maps hl icu_shape_mismatch findings", async () => {
    mockHlReport.mockResolvedValue({
      checks: ["icu_shape_mismatch"],
      findings: [
        {
          type: "icu_shape_mismatch",
          severity: "error",
          locale: "fr",
          sourceFile: "content/en/strings.json",
          targetFile: "content/fr/strings.json",
          key: "greeting",
          message: "ICU shape mismatch",
        },
      ],
      summary: { total: 1 },
    });

    const report = await runProviderJobQa(
      {
        externalJobId: "job-1",
        targetLocales: ["fr"],
        units: [
          unit({
            sourceText: "{count, plural, one {# item} other {# items}}",
            translations: [
              {
                locale: "fr",
                text: "{count, select, one {# item} other {# items}}",
              },
            ],
          }),
        ],
      },
      baseOptions,
    );

    expect(report.findings.some((finding) => finding.checkType === "icu_shape_mismatch")).toBe(
      true,
    );
  });

  it("maps hl not_localized to missing_translation", async () => {
    mockHlReport.mockResolvedValue({
      checks: ["not_localized"],
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
      ],
      summary: { total: 1 },
    });

    const report = await runProviderJobQa(
      {
        externalJobId: "job-1",
        targetLocales: ["fr"],
        units: [unit({ sourceText: "Hello", translations: [] })],
      },
      baseOptions,
    );

    expect(report.findings.some((finding) => finding.checkType === "missing_translation")).toBe(
      true,
    );
  });

  it("maps hl markdown_ast_mismatch to markdown_link", async () => {
    mockHlReport.mockResolvedValue({
      checks: ["markdown_ast_mismatch"],
      findings: [
        {
          type: "markdown_ast_mismatch",
          severity: "warning",
          locale: "fr",
          sourceFile: "content/en/strings.json",
          targetFile: "content/fr/strings.json",
          key: "greeting",
          message: "Markdown link mismatch",
        },
      ],
      summary: { total: 1 },
    });

    const report = await runProviderJobQa(
      {
        externalJobId: "job-1",
        targetLocales: ["fr"],
        units: [
          unit({
            sourceText: "Read [docs](https://example.com/docs)",
            translations: [{ locale: "fr", text: "Lisez [docs]()" }],
          }),
        ],
      },
      baseOptions,
    );

    expect(report.findings.some((finding) => finding.checkType === "markdown_link")).toBe(true);
  });
});

describe("supplemental provider QA checks", () => {
  it("reports stale_unchanged_target", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Updated source",
        translations: [{ locale: "fr", text: "Old target" }],
        providerPayload: {
          previousSourceText: "Old source",
          previousTargetText: "Old target",
        },
      }),
      baseOptions,
    );

    expect(findings.some((finding) => finding.checkType === "stale_unchanged_target")).toBe(true);
  });

  it("reports length_expansion", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Hi",
        translations: [{ locale: "fr", text: "Bonjour tout le monde" }],
      }),
      {
        ...baseOptions,
        lengthExpansionWarningRatio: 1.5,
      },
    );

    expect(findings.some((finding) => finding.checkType === "length_expansion")).toBe(true);
  });

  it("reports glossary_violation", () => {
    const findings = collectSupplementalQaFindings(
      unit({
        sourceText: "Save your changes",
        translations: [{ locale: "fr", text: "Sauvegardez vos modifications" }],
      }),
      {
        ...baseOptions,
        glossaryTerms: [
          {
            sourceTerm: "Save",
            targetTerm: "Enregistrer",
            forbidden: false,
            caseSensitive: false,
          },
        ],
      },
    );

    expect(findings.some((finding) => finding.checkType === "glossary_violation")).toBe(true);
  });
});

describe("runProviderJobQa summary", () => {
  it("returns normalized findings with summary", async () => {
    mockHlReport.mockResolvedValue({
      checks: ["placeholder_mismatch"],
      findings: [
        {
          type: "placeholder_mismatch",
          severity: "error",
          locale: "fr",
          sourceFile: "content/en/strings.json",
          targetFile: "content/fr/strings.json",
          key: "greeting",
          message: "Placeholder mismatch",
        },
      ],
      summary: { total: 1 },
    });

    const report = await runProviderJobQa(
      {
        externalJobId: "job-1",
        targetLocales: ["fr"],
        units: [
          unit({ sourceText: "Hello {name}", translations: [{ locale: "fr", text: "Bonjour" }] }),
        ],
      },
      baseOptions,
    );

    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.findings[0]).toMatchObject({
      severity: expect.any(String),
      message: expect.any(String),
      item: expect.objectContaining({ key: "greeting" }),
    });
  });
});

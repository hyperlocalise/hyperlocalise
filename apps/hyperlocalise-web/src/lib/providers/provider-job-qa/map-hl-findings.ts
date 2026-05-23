import type { HlCheckFinding, HlCheckReport } from "./hl-check-types";
import type { HlCheckKeyManifest } from "./materialize-hl-check-workspace";
import {
  confidenceForHlCheckType,
  normalizeProviderQaFinding,
} from "./normalize-provider-findings";
import type { ProviderQaCheckType, ProviderQaFinding, ProviderQaSeverity } from "./types";

const hlCheckTypeMap: Partial<Record<string, ProviderQaCheckType>> = {
  not_localized: "missing_translation",
  placeholder_mismatch: "placeholder_mismatch",
  icu_shape_mismatch: "icu_shape_mismatch",
  markdown_ast_mismatch: "markdown_link",
  html_tag_mismatch: "html_tag_mismatch",
  same_as_source: "tone_style_issue",
  whitespace_only: "whitespace_only_translation",
};

const hlSuggestedFixes: Partial<Record<ProviderQaCheckType, string>> = {
  missing_translation: "Provide a non-empty translation for this locale.",
  placeholder_mismatch: "Copy missing placeholders from the source string into the target.",
  icu_shape_mismatch:
    "Mirror plural, select, and selectordinal blocks from the source in the target.",
  markdown_link: "Preserve markdown link structure and destinations from the source.",
  html_tag_mismatch: "Mirror HTML tags from the source in the target translation.",
  tone_style_issue:
    "Translate the string instead of copying the source text, unless the source should remain untranslated.",
  whitespace_only_translation:
    "Replace whitespace-only content with a meaningful translation or remove the entry.",
};

function mapSeverity(severity: string): ProviderQaSeverity {
  if (severity === "warning") {
    return "warning";
  }
  if (severity === "info") {
    return "info";
  }
  return "error";
}

function resolveManifestEntry(
  key: string | undefined,
  manifest: HlCheckKeyManifest,
): HlCheckKeyManifest[string] | null {
  if (!key) {
    return null;
  }
  return manifest[key] ?? null;
}

export function mapHlFindingToProviderFinding(
  finding: HlCheckFinding,
  manifest: HlCheckKeyManifest,
  sourceLocale: string,
): ProviderQaFinding | null {
  const checkType = hlCheckTypeMap[finding.type];
  if (!checkType) {
    return null;
  }

  const entry = resolveManifestEntry(finding.key, manifest);
  if (!entry) {
    return null;
  }

  const locale = finding.locale ?? sourceLocale;
  const field: "source" | "target" =
    finding.type === "markdown_ast_mismatch" && !finding.locale ? "source" : "target";

  return normalizeProviderQaFinding(
    {
      checkType,
      severity: mapSeverity(finding.severity),
      message: finding.message?.trim() || `hl check reported ${finding.type}`,
      suggestedFix: hlSuggestedFixes[checkType],
      confidence: confidenceForHlCheckType(finding.type),
      item: {
        externalStringId: entry.externalStringId,
        key: entry.key,
        locale,
        field,
      },
    },
    { hlSourceType: finding.type },
  );
}

export function mapHlCheckReportToProviderFindings(input: {
  report: HlCheckReport;
  manifest: HlCheckKeyManifest;
  sourceLocale: string;
}): ProviderQaFinding[] {
  const findings: ProviderQaFinding[] = [];

  for (const finding of input.report.findings) {
    const mapped = mapHlFindingToProviderFinding(finding, input.manifest, input.sourceLocale);
    if (mapped) {
      findings.push(mapped);
    }
  }

  return findings;
}

export const providerQaCheckTypes = [
  "placeholder_mismatch",
  "icu_shape_mismatch",
  "invalid_icu_structure",
  "missing_translation",
  "stale_unchanged_target",
  "length_expansion",
  "json_invalid",
  "markdown_link",
  "glossary_violation",
] as const;

export type ProviderQaCheckType = (typeof providerQaCheckTypes)[number];

export const providerQaSeverityLevels = ["error", "warning", "info"] as const;

export type ProviderQaSeverity = (typeof providerQaSeverityLevels)[number];

export type ProviderQaItemReference = {
  externalStringId: string;
  key: string;
  locale?: string;
  field?: "source" | "target";
};

export type ProviderQaFinding = {
  checkType: ProviderQaCheckType;
  severity: ProviderQaSeverity;
  message: string;
  suggestedFix?: string;
  item: ProviderQaItemReference;
};

export type ProviderQaSummary = {
  total: number;
  byCheckType: Partial<Record<ProviderQaCheckType, number>>;
  bySeverity: Partial<Record<ProviderQaSeverity, number>>;
};

export type ProviderQaReport = {
  findings: ProviderQaFinding[];
  summary: ProviderQaSummary;
};

export type ProviderQaGlossaryTerm = {
  sourceTerm: string;
  targetTerm: string;
  forbidden: boolean;
  caseSensitive: boolean;
};

export type ProviderQaRunOptions = {
  targetLocales: string[];
  glossaryTerms?: ProviderQaGlossaryTerm[];
  lengthExpansionWarningRatio?: number;
  lengthExpansionErrorRatio?: number;
};

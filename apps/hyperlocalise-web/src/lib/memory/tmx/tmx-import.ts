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
import { canonicalizeLocale } from "@/lib/i18n/locales";

import { TMX_CONTEXT_PROP_TYPES, TMX_MAX_REPORT_ISSUES } from "./tmx-constants";
import type {
  MemoryImportCandidate,
  MemoryImportReport,
  TmxDocument,
  TmxIssue,
  TmxProperty,
  TmxUnit,
  TmxVariant,
} from "./tmx-types";

export function normalizeTmxLanguage(tag: string) {
  const trimmed = tag.trim().replaceAll("_", "-");
  return canonicalizeLocale(trimmed) ?? trimmed;
}

/**
 * Loose source-language match for header/unit `srclang`.
 * `en` matches `en-US`, but `en-US` does not match `en-GB`.
 */
export function languagesMatch(left: string, right: string) {
  const a = normalizeTmxLanguage(left).toLowerCase();
  const b = normalizeTmxLanguage(right).toLowerCase();
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  const aPrimary = a.split("-")[0];
  const bPrimary = b.split("-")[0];
  return aPrimary === bPrimary && (a === aPrimary || b === bPrimary);
}

/**
 * Same-language target detection for skipping dialect/script siblings in one TU.
 * `en-US` and `en-GB`, or `zh-Hans` and `zh-Hant`, share a primary subtag and must
 * not become source→target translation-memory pairs.
 */
export function samePrimaryLanguage(left: string, right: string) {
  const a = normalizeTmxLanguage(left).toLowerCase().split("-")[0] ?? "";
  const b = normalizeTmxLanguage(right).toLowerCase().split("-")[0] ?? "";
  return Boolean(a && b && a === b);
}

export function buildTmxExternalKey(
  tuid: string | undefined,
  sourceLocale: string,
  targetLocale: string,
) {
  if (!tuid?.trim()) {
    return null;
  }
  return `tmx:${tuid.trim()}:${sourceLocale}:${targetLocale}`;
}

function propertyValues(properties: TmxProperty[], type: string) {
  return properties.filter((property) => property.type.toLowerCase() === type.toLowerCase());
}

function collectContext(properties: TmxProperty[]) {
  const pre = propertyValues(properties, "x-context-pre")
    .map((property) => property.value)
    .join(" ");
  const post = propertyValues(properties, "x-context-post")
    .map((property) => property.value)
    .join(" ");
  const primary = properties
    .filter((property) => TMX_CONTEXT_PROP_TYPES.has(property.type.toLowerCase()))
    .filter(
      (property) =>
        property.type.toLowerCase() !== "x-context-pre" &&
        property.type.toLowerCase() !== "x-context-post",
    )
    .map((property) => property.value)
    .filter(Boolean);
  const parts = [...primary];
  if (pre) parts.push(pre);
  if (post) parts.push(post);
  return parts.join(" ").trim() || undefined;
}

function namespacedProps(properties: TmxProperty[]) {
  const props: Record<string, string | string[]> = {};
  for (const property of properties) {
    if (!property.type) {
      continue;
    }
    const existing = props[property.type];
    if (existing === undefined) {
      props[property.type] = property.value;
      continue;
    }
    if (Array.isArray(existing)) {
      existing.push(property.value);
      continue;
    }
    props[property.type] = [existing, property.value];
  }
  return props;
}

function reviewStatusFromProps(properties: TmxProperty[]) {
  const raw =
    propertyValues(properties, "x-review-status")[0]?.value ??
    propertyValues(properties, "review-status")[0]?.value;
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "approved" || normalized === "pending" || normalized === "rejected") {
    return normalized;
  }
  return undefined;
}

function pickSourceVariant(
  unit: TmxUnit,
  headerSrclang: string | undefined,
  issues: TmxIssue[],
): TmxVariant | null {
  const wanted =
    unit.srclang ?? (headerSrclang && headerSrclang !== "*all*" ? headerSrclang : undefined);
  if (wanted) {
    const exact = unit.variants.find(
      (variant) =>
        normalizeTmxLanguage(variant.language).toLowerCase() ===
        normalizeTmxLanguage(wanted).toLowerCase(),
    );
    if (exact) {
      return exact;
    }
    const loose = unit.variants.find((variant) => languagesMatch(variant.language, wanted));
    if (loose) {
      issues.push({
        severity: "warning",
        code: "source_language_prefix_match",
        message: `Source language "${wanted}" matched TUV "${loose.language}" by primary subtag`,
        unitIndex: unit.unitIndex,
        tuid: unit.tuid,
      });
      return loose;
    }
    issues.push({
      severity: "error",
      code: "source_tuv_missing",
      message: `No TUV matched source language "${wanted}"`,
      unitIndex: unit.unitIndex,
      tuid: unit.tuid,
    });
    return null;
  }
  if (headerSrclang === "*all*") {
    issues.push({
      severity: "warning",
      code: "srclang_all_uses_first_tuv",
      message: "Header srclang is *all*; the first TUV is treated as the source",
      unitIndex: unit.unitIndex,
      tuid: unit.tuid,
    });
  }
  return unit.variants[0] ?? null;
}

function buildMetadata(unit: TmxUnit, target: TmxVariant, sourceLanguage: string) {
  const notes = [...unit.notes, ...target.notes].filter((note) => note.trim().length > 0);
  const context = collectContext([...unit.properties, ...target.properties]);
  const reviewStatus = reviewStatusFromProps([...unit.properties, ...target.properties]);
  const props = namespacedProps([...unit.properties, ...target.properties]);
  return {
    ...(unit.tuid ? { tuid: unit.tuid } : {}),
    ...(context ? { context } : {}),
    ...(notes.length > 0 ? { notes } : {}),
    ...(unit.creationdate ? { creationdate: unit.creationdate } : {}),
    ...(unit.changedate ? { changedate: unit.changedate } : {}),
    ...(unit.creationid ? { creationid: unit.creationid } : {}),
    ...(unit.changeid ? { changeid: unit.changeid } : {}),
    ...(reviewStatus ? { reviewStatus } : {}),
    tmx: {
      sourceLanguage,
      props,
      ...(target.creationdate ? { tuvCreationdate: target.creationdate } : {}),
      ...(target.changedate ? { tuvChangedate: target.changedate } : {}),
      ...(target.creationid ? { tuvCreationid: target.creationid } : {}),
      ...(target.changeid ? { tuvChangeid: target.changeid } : {}),
    },
  };
}

export function documentToImportCandidates(document: TmxDocument): {
  candidates: MemoryImportCandidate[];
  issues: TmxIssue[];
} {
  const issues = [...document.issues];
  const candidates: MemoryImportCandidate[] = [];
  const headerSrclang = document.header.srclang?.trim();

  if (!headerSrclang) {
    issues.push({
      severity: "warning",
      code: "missing_header_srclang",
      message:
        "TMX header has no srclang; units without their own srclang use the first TUV as source",
    });
  }

  for (const unit of document.units) {
    if (unit.variants.length === 0) {
      issues.push({
        severity: "error",
        code: "empty_unit",
        message: "Translation unit has no TUV elements",
        unitIndex: unit.unitIndex,
        tuid: unit.tuid,
      });
      continue;
    }
    const source = pickSourceVariant(unit, headerSrclang, issues);
    if (!source) {
      continue;
    }
    if (!source.language || !source.segment.trim()) {
      issues.push({
        severity: "error",
        code: "empty_source_segment",
        message: "Source TUV is missing a language or segment",
        unitIndex: unit.unitIndex,
        tuid: unit.tuid,
      });
      continue;
    }

    const targets = unit.variants.filter((variant) => variant !== source);
    if (targets.length === 0) {
      issues.push({
        severity: "error",
        code: "missing_target_tuv",
        message: "Translation unit has no target TUV",
        unitIndex: unit.unitIndex,
        tuid: unit.tuid,
      });
      continue;
    }

    const seenTargetLanguages = new Set<string>();
    let variantIndex = 0;
    for (const target of targets) {
      if (!target.language || !target.segment.trim()) {
        issues.push({
          severity: "error",
          code: "empty_target_segment",
          message: "Target TUV is missing a language or segment",
          unitIndex: unit.unitIndex,
          tuid: unit.tuid,
        });
        continue;
      }
      if (samePrimaryLanguage(source.language, target.language)) {
        issues.push({
          severity: "warning",
          code: "same_language_variant_skipped",
          message: `Skipped same-language target variant "${target.language}"`,
          unitIndex: unit.unitIndex,
          tuid: unit.tuid,
        });
        continue;
      }
      const languageKey = normalizeTmxLanguage(target.language).toLowerCase();
      if (seenTargetLanguages.has(languageKey)) {
        issues.push({
          severity: "warning",
          code: "duplicate_target_variant",
          message: `Additional "${target.language}" variant in the same unit was skipped`,
          unitIndex: unit.unitIndex,
          tuid: unit.tuid,
        });
        continue;
      }
      seenTargetLanguages.add(languageKey);
      const sourceLocale = normalizeTmxLanguage(source.language);
      const targetLocale = normalizeTmxLanguage(target.language);
      candidates.push({
        sourceLocale,
        targetLocale,
        sourceText: source.segment,
        targetText: target.segment,
        matchScore: 100,
        externalKey: buildTmxExternalKey(unit.tuid, sourceLocale, targetLocale),
        metadata: buildMetadata(unit, target, sourceLocale),
        unitIndex: unit.unitIndex,
        tuid: unit.tuid,
        isVariant: variantIndex > 0,
      });
      variantIndex += 1;
    }
  }

  return { candidates, issues };
}

export function emptyImportReport(
  issues: TmxIssue[] = [],
  headerSrclang?: string,
): MemoryImportReport {
  return {
    totalRead: 0,
    created: 0,
    updated: 0,
    variantCreated: 0,
    skipped: 0,
    warned: issues.filter((issue) => issue.severity === "warning").length,
    failed: issues.filter((issue) => issue.severity === "error").length,
    issues: issues.slice(0, TMX_MAX_REPORT_ISSUES),
    headerSrclang,
    truncatedIssues: issues.length > TMX_MAX_REPORT_ISSUES,
  };
}

export function finalizeImportReport(
  report: Omit<MemoryImportReport, "warned" | "failed" | "issues" | "truncatedIssues"> & {
    issues: TmxIssue[];
  },
): MemoryImportReport {
  return {
    ...report,
    warned: report.issues.filter((issue) => issue.severity === "warning").length,
    failed: report.issues.filter((issue) => issue.severity === "error").length,
    issues: report.issues.slice(0, TMX_MAX_REPORT_ISSUES),
    truncatedIssues: report.issues.length > TMX_MAX_REPORT_ISSUES,
  };
}

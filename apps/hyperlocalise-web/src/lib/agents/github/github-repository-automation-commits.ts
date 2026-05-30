import type { HlCheckReport } from "@/lib/providers/provider-job-qa/hl-check-types";

import {
  filterPathsToLocalisationScope,
  type I18nBucketFilePatterns,
} from "./github-repository-automation-localisation-paths";

export type AutomationCommitRef = {
  sha: string;
  parentSha: string | null;
};

const ZERO_SHA = "0000000000000000000000000000000000000000";

export function isZeroCommitSha(sha: string | null | undefined): boolean {
  return !sha || sha === ZERO_SHA;
}

export function parseCommitLogLines(output: string): AutomationCommitRef[] {
  const commits: AutomationCommitRef[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const [sha, parentSha] = trimmed.split("\t");
    if (!sha) {
      continue;
    }

    commits.push({
      sha,
      parentSha: parentSha && parentSha.length > 0 ? parentSha : null,
    });
  }

  return commits;
}

export function buildCommitRangeLogArgs(input: {
  commitBefore: string | null | undefined;
  commitAfter: string | null | undefined;
}): string[] {
  if (!input.commitAfter) {
    return [];
  }

  if (isZeroCommitSha(input.commitBefore)) {
    return ["log", "--reverse", "--format=%H%x09%P", "-n", "50", input.commitAfter];
  }

  if (!input.commitBefore) {
    return ["log", "--reverse", "--format=%H%x09%P", "-n", "50", input.commitAfter];
  }

  return ["log", "--reverse", "--format=%H%x09%P", `${input.commitBefore}..${input.commitAfter}`];
}

export function parseNameOnlyDiffPaths(output: string): string[] {
  const unique = new Set<string>();

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    unique.add(trimmed.replaceAll("\\", "/"));
  }

  return [...unique].sort();
}

export function buildCommitScopedDiffArgs(input: {
  parentSha: string | null;
  commitSha: string;
  paths: string[];
}): string[] {
  const range = input.parentSha ? `${input.parentSha}..${input.commitSha}` : input.commitSha;
  const args = ["diff", "--name-only", range, "--"];

  for (const path of input.paths) {
    args.push(path);
  }

  return args;
}

export function buildCommitScopedPatchArgs(input: {
  parentSha: string | null;
  commitSha: string;
  paths: string[];
}): string[] {
  const range = input.parentSha ? `${input.parentSha}..${input.commitSha}` : input.commitSha;
  const args = ["diff", range, "--"];

  for (const path of input.paths) {
    args.push(path);
  }

  return args;
}

export function classifyHlCheckReport(report: HlCheckReport): "passed" | "warning" | "failed" {
  const findings = report.findings ?? [];
  if (findings.length === 0) {
    return "passed";
  }

  const hasError = findings.some((finding) => finding.severity === "error");
  if (hasError) {
    return "failed";
  }

  const hasWarning = findings.some((finding) => finding.severity === "warning");
  if (hasWarning) {
    return "warning";
  }

  return "passed";
}

export function shouldSkipCommitForPaths(input: {
  changedPaths: string[];
  patterns: I18nBucketFilePatterns;
}): { skipped: true; reason: string } | { skipped: false; paths: string[] } {
  const scopedPaths = filterPathsToLocalisationScope(input.changedPaths, input.patterns);
  if (scopedPaths.length === 0) {
    return {
      skipped: true,
      reason: "no_configured_localisation_paths_changed",
    };
  }

  return { skipped: false, paths: scopedPaths };
}

export function buildSuggestedFixesFromHlCheckReport(report: HlCheckReport) {
  return (report.findings ?? [])
    .filter((finding) => finding.severity === "error" || finding.severity === "warning")
    .slice(0, 20)
    .map((finding) => ({
      type: finding.type,
      severity: finding.severity,
      locale: finding.locale ?? null,
      sourceFile: finding.sourceFile,
      targetFile: finding.targetFile ?? null,
      key: finding.key ?? null,
      message: finding.message ?? null,
    }));
}

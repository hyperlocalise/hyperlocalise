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
import { DEFAULT_QA_POLICY } from "@/lib/qa/qa-policy";
import type {
  ProjectQaReport,
  WorkspaceQaFinding,
  WorkspaceQaReportRow,
} from "@/lib/qa/qa-report-client";

export const qaOrganizationSlug = "acme";
export const qaWebsiteProjectId = "project_website";
export const qaLatestRunId = "run_latest";
export const qaOlderRunId = "run_older";

const emptySummary = {
  byCheckType: {},
  bySeverity: {},
  byLocale: {},
};

export function createQaReport(
  overrides: Partial<ProjectQaReport> & Pick<ProjectQaReport, "id" | "projectId" | "status">,
): ProjectQaReport {
  return {
    trigger: "manual",
    segmentCount: 0,
    findingCount: 0,
    errorCount: 0,
    warningCount: 0,
    summary: emptySummary,
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-10-01T08:00:00.000Z",
    completedAt: overrides.status === "succeeded" ? "2026-10-01T08:04:00.000Z" : null,
    createdAt: "2026-10-01T08:00:00.000Z",
    ...overrides,
  };
}

export const qaWebsiteReport = createQaReport({
  id: qaLatestRunId,
  projectId: qaWebsiteProjectId,
  status: "succeeded",
  segmentCount: 128,
  findingCount: 5,
  errorCount: 2,
  warningCount: 3,
  summary: {
    byCheckType: {
      placeholder_mismatch: 1,
      glossary_violation: 1,
      spelling: 1,
      format: 1,
      same_as_source: 1,
    },
    bySeverity: { error: 2, warning: 3 },
    byLocale: { "de-DE": 3, "fr-FR": 2 },
    checkVersion: 2,
  },
  completedAt: "2026-10-01T08:04:00.000Z",
});

export const qaOlderReport = createQaReport({
  id: qaOlderRunId,
  projectId: qaWebsiteProjectId,
  trigger: "scheduled",
  status: "succeeded",
  segmentCount: 120,
  findingCount: 1,
  errorCount: 1,
  warningCount: 0,
  summary: {
    byCheckType: { not_localized: 1 },
    bySeverity: { error: 1 },
    byLocale: { "de-DE": 1 },
    checkVersion: 2,
  },
  startedAt: "2026-09-24T08:00:00.000Z",
  completedAt: "2026-09-24T08:03:00.000Z",
  createdAt: "2026-09-24T08:00:00.000Z",
});

export const qaRunningReport = createQaReport({
  id: "run_mobile",
  projectId: "project_mobile",
  status: "running",
  segmentCount: 40,
  startedAt: "2026-10-02T01:00:00.000Z",
  createdAt: "2026-10-02T01:00:00.000Z",
});

export const qaFailedReport = createQaReport({
  id: "run_release",
  projectId: "project_release",
  status: "failed",
  errorCode: "qa_scan_processing_failed",
  errorMessage: "private source text must not appear in the UI",
  startedAt: "2026-10-01T02:00:00.000Z",
  completedAt: "2026-10-01T02:01:00.000Z",
  createdAt: "2026-10-01T02:00:00.000Z",
});

export const qaCleanReport = createQaReport({
  id: "run_clean",
  projectId: qaWebsiteProjectId,
  status: "succeeded",
  segmentCount: 64,
  summary: {
    byCheckType: {},
    bySeverity: {},
    byLocale: { "de-DE": 0 },
    checkVersion: 2,
  },
});

export const qaPartialReport = createQaReport({
  id: "run_partial",
  projectId: qaWebsiteProjectId,
  status: "succeeded",
  segmentCount: 64,
  summary: {
    byCheckType: {},
    bySeverity: {},
    byLocale: { "de-DE": 0 },
    skippedChecksByLocale: { "de-DE": ["spelling"] },
  },
});

export function createQaProjectSettings(
  overrides: Partial<{
    cadence: "off" | "daily";
    checks: typeof DEFAULT_QA_POLICY;
    lastRunAt: string | null;
    canRun: boolean;
    canManageSchedule: boolean;
  }> = {},
) {
  return {
    cadence: "daily" as const,
    checks: structuredClone(DEFAULT_QA_POLICY),
    lastRunAt: "2026-10-01T08:04:00.000Z",
    canRun: true,
    canManageSchedule: true,
    ...overrides,
  };
}

export const qaProjectSettings = createQaProjectSettings();

function finding(
  overrides: Partial<WorkspaceQaFinding> &
    Pick<WorkspaceQaFinding, "id" | "key" | "checkType" | "severity" | "targetLocale">,
): WorkspaceQaFinding {
  return {
    runId: qaLatestRunId,
    projectId: qaWebsiteProjectId,
    projectName: "Website localization",
    sourcePath: "app/dashboard/index.tsx",
    category: "qa",
    message: "This translation needs review.",
    relatedTokens: [],
    sourceText: "Reviews waiting",
    targetText: "Bewertungen warten",
    editorHref: `/org/${qaOrganizationSlug}/projects/${qaWebsiteProjectId}/files`,
    status: "open",
    ...overrides,
  };
}

export const qaPlaceholderFinding = finding({
  id: "finding_placeholder",
  key: "dashboard.reviews.pending",
  checkType: "placeholder_mismatch",
  severity: "error",
  targetLocale: "de-DE",
  category: "placeholder",
  message: "The translation is missing {count}.",
  relatedTokens: ["{count}"],
  sourceText: "{count} reviews  waiting",
  targetText: "Bewertungen warten",
});

export const qaGlossaryFinding = finding({
  id: "finding_glossary",
  key: "checkout.pay_now",
  sourcePath: "app/checkout/pay.tsx",
  checkType: "glossary_violation",
  severity: "warning",
  targetLocale: "fr-FR",
  category: "glossary",
  message: "Use the approved term “Payer”.",
  relatedTokens: ["Payer"],
  sourceText: "Pay now",
  targetText: "Régler",
});

export const qaSpellingFinding = finding({
  id: "finding_spelling",
  key: "legal.privacy.intro",
  sourcePath: "app/legal/privacy.md",
  checkType: "spelling",
  severity: "warning",
  targetLocale: "de-DE",
  category: "spelling",
  message: "“Hyperlocalise” is not in the dictionary.",
  sourceText: "Hyperlocalise privacy",
  targetText: "Hyperlocalise Datenschutz",
  status: "ignored",
  ignoreReason: "Brand name",
});

export const qaLinkedFinding = finding({
  id: "finding_linked",
  key: "home.hero.title",
  sourcePath: "app/home/hero.tsx",
  checkType: "format",
  severity: "warning",
  targetLocale: "de-DE",
  category: "syntax",
  message: "The translation drops the bold tag.",
  relatedTokens: ["<b>"],
  sourceText: "Ship <b>faster</b>",
  targetText: "Schneller liefern",
  issueIdentifier: "WEB-14",
});

export const qaRecheckFinding = finding({
  id: "finding_recheck",
  key: "auth.sign_in",
  sourcePath: "app/auth/sign-in.tsx",
  checkType: "same_as_source",
  severity: "error",
  targetLocale: "fr-FR",
  message: "The translation is the same as the source.",
  sourceText: "Sign in",
  targetText: "Sign in",
  needsRecheck: true,
});

export const qaWhitespaceFinding = finding({
  id: "finding_whitespace",
  key: "billing.plan.credit",
  sourcePath: "lang/en-US.json",
  checkType: "format",
  severity: "error",
  targetLocale: "de-DE",
  category: "syntax",
  message:
    'translation invariant violation: whitespace profile mismatch (non-breaking space count differs from source) | source="$2,000 per month AI credit" candidate="$2.000 KI-Guthaben pro Monat"',
  sourceText: "$2,000\u00a0per month AI credit",
  targetText: "$2.000 KI-Guthaben pro Monat",
});

export const qaOlderFinding = finding({
  id: "finding_older",
  runId: qaOlderRunId,
  key: "billing.invoice.empty",
  sourcePath: "app/billing/invoice.tsx",
  checkType: "not_localized",
  severity: "error",
  targetLocale: "de-DE",
  message: "This string has no translation.",
  sourceText: "No invoices yet",
  targetText: "",
});

export const qaWorkspaceFindings: WorkspaceQaFinding[] = [
  qaPlaceholderFinding,
  qaGlossaryFinding,
  qaSpellingFinding,
  qaLinkedFinding,
  qaRecheckFinding,
];

export const qaProjectFindings: WorkspaceQaFinding[] = [...qaWorkspaceFindings, qaOlderFinding];

export const qaWorkspaceReports: WorkspaceQaReportRow[] = [
  {
    projectId: qaWebsiteProjectId,
    projectName: "Website localization",
    cadence: "daily",
    lastRunAt: qaWebsiteReport.completedAt,
    lastSuccessfulAt: qaWebsiteReport.completedAt,
    report: qaWebsiteReport,
  },
  {
    projectId: "project_mobile",
    projectName: "Mobile app",
    cadence: "off",
    lastRunAt: null,
    lastSuccessfulAt: null,
    report: qaRunningReport,
  },
  {
    projectId: "project_help",
    projectName: "Help center",
    cadence: "off",
    lastRunAt: null,
    lastSuccessfulAt: null,
    report: null,
  },
  {
    projectId: "project_release",
    projectName: "Release notes",
    cadence: "daily",
    lastRunAt: qaFailedReport.createdAt,
    lastSuccessfulAt: "2026-09-30T05:00:00.000Z",
    report: qaFailedReport,
  },
];

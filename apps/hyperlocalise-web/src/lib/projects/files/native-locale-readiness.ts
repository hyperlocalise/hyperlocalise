export type NativeLocaleReadinessValue =
  | "ready"
  | "missing"
  | "changed"
  | "stale"
  | "in_progress"
  | "needs_review";

export type FileJobLocaleStatus = {
  locale: string;
  status: string;
  createdAt: Date;
};

export function parseJobTargetLocales(inputPayload: unknown): string[] {
  if (typeof inputPayload !== "object" || inputPayload === null) {
    return [];
  }

  const targetLocales = (inputPayload as Record<string, unknown>).targetLocales;
  if (!Array.isArray(targetLocales)) {
    return [];
  }

  return targetLocales.filter((locale): locale is string => typeof locale === "string");
}

export function mapJobStatusToLocaleReadiness(jobStatus: string): NativeLocaleReadinessValue {
  switch (jobStatus) {
    case "succeeded":
      return "ready";
    case "waiting_for_review":
      return "needs_review";
    case "failed":
    case "cancelled":
      return "stale";
    case "queued":
    case "running":
      return "in_progress";
    default:
      return "missing";
  }
}

export function buildJobsByLocaleFromRecords(
  jobs: readonly {
    status: string;
    createdAt: Date;
    inputPayload: unknown;
  }[],
): Map<string, FileJobLocaleStatus> {
  const jobsByLocale = new Map<string, FileJobLocaleStatus>();

  const sortedJobs = [...jobs].toSorted(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );

  for (const job of sortedJobs) {
    for (const locale of parseJobTargetLocales(job.inputPayload)) {
      if (!jobsByLocale.has(locale)) {
        jobsByLocale.set(locale, {
          locale,
          status: job.status,
          createdAt: job.createdAt,
        });
      }
    }
  }

  return jobsByLocale;
}

export function buildNativeFileLocaleReadiness(input: {
  targetLocales: string[];
  jobsByLocale: Map<string, FileJobLocaleStatus>;
}): Record<string, NativeLocaleReadinessValue> {
  const result: Record<string, NativeLocaleReadinessValue> = {};

  for (const locale of input.targetLocales) {
    const job = input.jobsByLocale.get(locale);
    result[locale] = job ? mapJobStatusToLocaleReadiness(job.status) : "missing";
  }

  return result;
}

export function resolveFileLocaleReadiness(file: {
  provider?: { localeReadiness?: Record<string, unknown> } | null;
  localeReadiness?: Record<string, unknown>;
}): Record<string, unknown> {
  if (file.provider?.localeReadiness && Object.keys(file.provider.localeReadiness).length > 0) {
    return file.provider.localeReadiness;
  }

  return file.localeReadiness ?? {};
}

export function fileNeedsAttentionFromReadiness(localeReadiness: Record<string, unknown>) {
  return Object.values(localeReadiness).some(
    (value) => value === "missing" || value === "stale" || value === "changed",
  );
}

export function countReadyLocales(localeReadiness: Record<string, unknown>) {
  return Object.values(localeReadiness).filter((value) => value === "ready" || value === "complete")
    .length;
}

export function summarizeNativeLocaleReadiness(
  localeReadiness: Record<string, unknown>,
  targetLocaleCount: number,
) {
  if (targetLocaleCount === 0) {
    return null;
  }

  const summary = Object.entries(localeReadiness);
  if (summary.length === 0) {
    return `${targetLocaleCount} missing`;
  }

  const ready = summary.filter(([, value]) => value === "ready" || value === "complete").length;
  const missing = summary.filter(([, value]) => value === "missing" || value === "stale").length;
  const changed = summary.filter(([, value]) => value === "changed").length;
  const inProgress = summary.filter(([, value]) => value === "in_progress").length;
  const needsReview = summary.filter(([, value]) => value === "needs_review").length;

  const parts: string[] = [];
  if (ready > 0) parts.push(`${ready} ready`);
  if (missing > 0) parts.push(`${missing} missing`);
  if (changed > 0) parts.push(`${changed} changed`);
  if (inProgress > 0) parts.push(`${inProgress} in progress`);
  if (needsReview > 0) parts.push(`${needsReview} review`);

  return parts.length > 0 ? parts.join(" · ") : `${ready}/${targetLocaleCount} locales`;
}

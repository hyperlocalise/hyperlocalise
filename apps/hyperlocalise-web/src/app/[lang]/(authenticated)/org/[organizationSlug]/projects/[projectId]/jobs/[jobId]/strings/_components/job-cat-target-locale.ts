import type { JobDetailRecord } from "../../_components/job-detail-types";

function normalizeTargetLocales(locales: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const locale of locales) {
    const trimmed = locale.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }

  return normalized;
}

function getInputPayloadStringArray(job: { inputPayload: unknown }, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return [];
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function resolveJobCatSelectableTargetLocales(
  job: Pick<JobDetailRecord, "externalTargetLocales" | "reviewTargetLocale" | "inputPayload">,
) {
  if (job.externalTargetLocales && job.externalTargetLocales.length > 0) {
    return normalizeTargetLocales(job.externalTargetLocales);
  }

  const payloadLocales = getInputPayloadStringArray(job, "targetLocales");
  if (payloadLocales.length > 0) {
    return normalizeTargetLocales(payloadLocales);
  }

  const reviewTargetLocale = job.reviewTargetLocale?.trim();
  if (reviewTargetLocale) {
    return [reviewTargetLocale];
  }

  return [];
}

export function selectJobCatTargetLocale({
  requestedTargetLocale,
  providerTargetLocales,
}: {
  requestedTargetLocale: string | null;
  providerTargetLocales: readonly string[];
}) {
  if (requestedTargetLocale && providerTargetLocales.includes(requestedTargetLocale)) {
    return requestedTargetLocale;
  }

  return providerTargetLocales[0] ?? null;
}

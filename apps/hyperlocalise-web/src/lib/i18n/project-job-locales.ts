import { err, ok, type Result } from "@/lib/primitives/result/results";

import { canonicalizeLocale } from "./locales";

export type JobLocaleValidationError = {
  code: string;
  message: string;
};

type ProjectLocaleScope = {
  source: "native" | "external_tms";
  sourceLocale: string | null;
  targetLocales: string[];
};

type JobLocaleInput = {
  sourceLocale: string;
  targetLocales: string[];
};

function localeKey(locale: string) {
  return locale.trim().toLowerCase();
}

function projectAllowsLocale(
  project: ProjectLocaleScope,
  locale: string,
  role: "source" | "target",
) {
  if (project.source === "external_tms") {
    const allowed =
      role === "source"
        ? project.sourceLocale
          ? [project.sourceLocale]
          : []
        : project.targetLocales;
    return allowed.some((entry) => entry === locale);
  }

  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return false;
  }

  if (role === "source") {
    return project.sourceLocale ? localeKey(project.sourceLocale) === localeKey(canonical) : true;
  }

  if (project.targetLocales.length === 0) {
    return true;
  }

  return project.targetLocales.some((entry) => localeKey(entry) === localeKey(canonical));
}

/**
 * Validates translation job locales against a project's configured locale scope.
 * External TMS projects use exact provider locale IDs; native projects use canonical BCP-47.
 */
export function validateJobLocalesAgainstProject(
  project: ProjectLocaleScope,
  input: JobLocaleInput,
): Result<void, JobLocaleValidationError> {
  if (project.source === "external_tms") {
    if (project.sourceLocale && input.sourceLocale !== project.sourceLocale) {
      return err({
        code: "job_source_locale_not_in_project",
        message: "Source locale must match the synced TMS project source locale",
      });
    }

    if (project.targetLocales.length > 0) {
      const invalidTargets = input.targetLocales.filter(
        (locale) => !project.targetLocales.includes(locale),
      );
      if (invalidTargets.length > 0) {
        return err({
          code: "job_target_locale_not_in_project",
          message: `Target locales must be configured on the project: ${invalidTargets.join(", ")}`,
        });
      }
    }

    return ok(undefined);
  }

  const sourceLocale = canonicalizeLocale(input.sourceLocale);
  if (!sourceLocale) {
    return err({
      code: "invalid_job_source_locale",
      message: "Invalid source locale",
    });
  }

  if (!projectAllowsLocale(project, sourceLocale, "source")) {
    return err({
      code: "job_source_locale_not_in_project",
      message: "Source locale must match the project source locale",
    });
  }

  const normalizedTargets: string[] = [];
  for (const raw of input.targetLocales) {
    const canonical = canonicalizeLocale(raw);
    if (!canonical) {
      return err({
        code: "invalid_job_target_locale",
        message: `Invalid target locale: ${raw}`,
      });
    }

    if (!projectAllowsLocale(project, canonical, "target")) {
      return err({
        code: "job_target_locale_not_in_project",
        message: `Target locale is not enabled on this project: ${canonical}`,
      });
    }

    normalizedTargets.push(canonical);
  }

  if (normalizedTargets.some((locale) => localeKey(locale) === localeKey(sourceLocale))) {
    return err({
      code: "job_source_in_targets",
      message: "Source locale cannot appear in target locales",
    });
  }

  return ok(undefined);
}

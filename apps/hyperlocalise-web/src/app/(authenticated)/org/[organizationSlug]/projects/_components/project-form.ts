import { canonicalizeLocale, normalizeProjectLocales } from "@/lib/i18n/locales";

import type { ProjectListRow } from "./project-list";

export type ProjectFormValues = {
  name: string;
  description: string;
  translationContext: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type ProjectFormErrors = Partial<Record<keyof ProjectFormValues, string>> & {
  targetLocales?: string;
};

export const defaultNativeProjectSourceLocale = "en-US";

export const defaultNativeProjectTargetLocales = ["fr-FR", "de-DE"];

export function createEmptyProjectForm(): ProjectFormValues {
  return {
    name: "",
    description: "",
    translationContext: "",
    sourceLocale: defaultNativeProjectSourceLocale,
    targetLocales: [...defaultNativeProjectTargetLocales],
  };
}

export function createProjectFormFromRow(project: ProjectListRow): ProjectFormValues {
  return {
    name: project.name,
    description: project.descriptionValue,
    translationContext: project.translationContextValue,
    sourceLocale: project.sourceLocale ?? defaultNativeProjectSourceLocale,
    targetLocales:
      project.targetLocales.length > 0
        ? project.targetLocales
        : [...defaultNativeProjectTargetLocales],
  };
}

export function validateProjectForm(
  values: ProjectFormValues,
  options?: { requireLocales?: boolean },
): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  const name = values.name.trim();
  const requireLocales = options?.requireLocales ?? true;

  if (!name) {
    errors.name = "Project name is required.";
  } else if (name.length > 200) {
    errors.name = "Project name must be 200 characters or fewer.";
  }

  if (values.description.trim().length > 10_000) {
    errors.description = "Description must be 10,000 characters or fewer.";
  }

  if (values.translationContext.trim().length > 20_000) {
    errors.translationContext = "Translation context must be 20,000 characters or fewer.";
  }

  if (requireLocales) {
    const normalized = normalizeProjectLocales({
      sourceLocale: values.sourceLocale,
      targetLocales: values.targetLocales,
    });

    if ("error" in normalized) {
      if (normalized.error === "invalid_source_locale") {
        errors.sourceLocale = "Select a valid source locale.";
      } else if (normalized.error === "source_in_targets") {
        errors.targetLocales = "Remove the source locale from target locales.";
      } else {
        errors.targetLocales = "Select at least one valid target locale.";
      }
    }
  }

  return errors;
}

export function projectFormHasErrors(errors: ProjectFormErrors) {
  return Object.keys(errors).length > 0;
}

export type ProjectMetadataPayload = {
  name: string;
  description: string;
  translationContext: string;
};

export type ProjectCreatePayload = ProjectMetadataPayload & {
  sourceLocale: string;
  targetLocales: string[];
};

export type ProjectUpdatePayload = ProjectMetadataPayload & {
  sourceLocale?: string;
  targetLocales?: string[];
};

function buildMetadataPayload(values: ProjectFormValues): ProjectMetadataPayload {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    translationContext: values.translationContext.trim(),
  };
}

function buildLocalePayload(values: ProjectFormValues) {
  const normalized = normalizeProjectLocales({
    sourceLocale: values.sourceLocale,
    targetLocales: values.targetLocales,
  });

  if ("error" in normalized) {
    throw new Error(normalized.error);
  }

  return {
    sourceLocale: normalized.sourceLocale,
    targetLocales: normalized.targetLocales,
  };
}

export function toProjectPayload(
  values: ProjectFormValues,
  options: { mode: "create" },
): ProjectCreatePayload;
export function toProjectPayload(
  values: ProjectFormValues,
  options: { mode: "edit"; includeLocales?: boolean },
): ProjectUpdatePayload;
export function toProjectPayload(
  values: ProjectFormValues,
  options: { mode: "create" | "edit"; includeLocales?: boolean },
): ProjectCreatePayload | ProjectUpdatePayload {
  const payload = buildMetadataPayload(values);
  const includeLocales = options.includeLocales ?? options.mode === "create";

  if (!includeLocales) {
    return payload;
  }

  return {
    ...payload,
    ...buildLocalePayload(values),
  };
}

export function projectFormRequiresLocales(
  mode: "create" | "edit",
  source: ProjectListRow["source"],
) {
  return mode === "create" || source === "native";
}

export function formatProjectLocaleSummary(sourceLocale: string | null, targetLocales: string[]) {
  if (!sourceLocale && targetLocales.length === 0) {
    return "No locales configured";
  }

  const source = sourceLocale ? (canonicalizeLocale(sourceLocale) ?? sourceLocale) : "—";
  const targets =
    targetLocales.length > 0
      ? targetLocales.map((locale) => canonicalizeLocale(locale) ?? locale).join(", ")
      : "—";

  return `${source} → ${targets}`;
}

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
import type { IntlShape } from "@formatjs/intl";

import { canonicalizeLocale, normalizeProjectLocales } from "@/lib/i18n/locales";
import { projectIssueIdentifierSchema } from "@/lib/projects/issue-identifier/project-issue-identifier";

import { projectFormMessages } from "./project-form.messages";
import type { ProjectListRow } from "./project-list";

export type ProjectFormValues = {
  name: string;
  identifier: string;
  description: string;
  translationContext: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type ProjectFormErrors = Partial<Record<keyof ProjectFormValues, string>> & {
  targetLocales?: string;
};

export type ProjectFormIntl = Pick<IntlShape, "formatMessage">;

export const defaultNativeProjectSourceLocale = "en-US";

export const defaultNativeProjectTargetLocales = ["fr-FR", "de-DE"];

function resolveMessage(
  intl: ProjectFormIntl | undefined,
  descriptor: (typeof projectFormMessages)[keyof typeof projectFormMessages],
  values?: Record<string, string>,
) {
  if (intl) {
    return intl.formatMessage(descriptor, values);
  }

  return typeof descriptor.defaultMessage === "string" ? descriptor.defaultMessage : "";
}

export function createEmptyProjectForm(): ProjectFormValues {
  return {
    name: "",
    identifier: "",
    description: "",
    translationContext: "",
    sourceLocale: defaultNativeProjectSourceLocale,
    targetLocales: [...defaultNativeProjectTargetLocales],
  };
}

export function createProjectFormFromRow(project: ProjectListRow): ProjectFormValues {
  return {
    name: project.name,
    identifier: project.identifier,
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
  options?: { requireLocales?: boolean; requireIdentifier?: boolean; intl?: ProjectFormIntl },
): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  const name = values.name.trim();
  const requireLocales = options?.requireLocales ?? true;
  const requireIdentifier = options?.requireIdentifier ?? false;
  const intl = options?.intl;

  if (!name) {
    errors.name = resolveMessage(intl, projectFormMessages.nameRequired);
  } else if (name.length > 200) {
    errors.name = resolveMessage(intl, projectFormMessages.nameTooLong);
  }

  if (values.description.trim().length > 10_000) {
    errors.description = resolveMessage(intl, projectFormMessages.descriptionTooLong);
  }

  if (values.translationContext.trim().length > 20_000) {
    errors.translationContext = resolveMessage(intl, projectFormMessages.translationContextTooLong);
  }

  const identifier = values.identifier.trim();
  if (requireIdentifier || identifier) {
    const parsed = projectIssueIdentifierSchema.safeParse(identifier);
    if (!parsed.success) {
      errors.identifier = resolveMessage(intl, projectFormMessages.invalidIdentifier);
    }
  }

  if (requireLocales) {
    const normalized = normalizeProjectLocales({
      sourceLocale: values.sourceLocale,
      targetLocales: values.targetLocales,
    });

    if ("error" in normalized) {
      if (normalized.error === "invalid_source_locale") {
        errors.sourceLocale = resolveMessage(intl, projectFormMessages.invalidSourceLocale);
      } else if (normalized.error === "source_in_targets") {
        errors.targetLocales = resolveMessage(intl, projectFormMessages.sourceInTargets);
      } else {
        errors.targetLocales = resolveMessage(intl, projectFormMessages.targetLocalesRequired);
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

export type ProjectUpdatePayload = Partial<ProjectMetadataPayload> & {
  identifier?: string;
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
  options: { mode: "edit"; includeLocales?: boolean; includeMetadata?: boolean },
): ProjectUpdatePayload;
export function toProjectPayload(
  values: ProjectFormValues,
  options: { mode: "create" | "edit"; includeLocales?: boolean; includeMetadata?: boolean },
): ProjectCreatePayload | ProjectUpdatePayload {
  const payload = buildMetadataPayload(values);
  const includeLocales = options.includeLocales ?? options.mode === "create";
  const includeMetadata = options.includeMetadata ?? true;
  const identifier = values.identifier.trim().toUpperCase();

  if (options.mode === "edit") {
    const editPayload: ProjectUpdatePayload = {
      ...(includeMetadata ? payload : {}),
      ...(identifier ? { identifier } : {}),
    };
    if (!includeLocales) {
      return editPayload;
    }
    return {
      ...editPayload,
      ...buildLocalePayload(values),
    };
  }

  if (!includeLocales) {
    return payload;
  }

  return {
    ...payload,
    ...buildLocalePayload(values),
  };
}

export type ProjectSettingsSection = "general" | "styleGuide" | "locales";

function normalizedText(value: string) {
  return value.trim();
}

function normalizedIdentifier(value: string) {
  return value.trim().toUpperCase();
}

function normalizedLocaleList(locales: string[]) {
  return locales
    .map((locale) => canonicalizeLocale(locale) ?? locale.trim())
    .filter((locale) => locale.length > 0)
    .toSorted((a, b) => a.localeCompare(b));
}

export function projectFormLocalesEqual(left: string[], right: string[]) {
  const canonicalLeft = normalizedLocaleList(left);
  const canonicalRight = normalizedLocaleList(right);
  if (canonicalLeft.length !== canonicalRight.length) {
    return false;
  }
  return canonicalLeft.every((locale, index) => locale === canonicalRight[index]);
}

function projectFormFieldIsDirty(
  field: keyof ProjectFormValues,
  values: ProjectFormValues,
  baseline: ProjectFormValues,
) {
  if (field === "targetLocales") {
    return !projectFormLocalesEqual(values.targetLocales, baseline.targetLocales);
  }

  if (field === "sourceLocale") {
    const left = canonicalizeLocale(values.sourceLocale) ?? values.sourceLocale.trim();
    const right = canonicalizeLocale(baseline.sourceLocale) ?? baseline.sourceLocale.trim();
    return left !== right;
  }

  if (field === "identifier") {
    return normalizedIdentifier(values.identifier) !== normalizedIdentifier(baseline.identifier);
  }

  return normalizedText(values[field]) !== normalizedText(baseline[field]);
}

export function projectSettingsSectionIsDirty(
  section: ProjectSettingsSection,
  values: ProjectFormValues,
  baseline: ProjectFormValues,
  options?: { identifierOnly?: boolean },
) {
  switch (section) {
    case "general":
      if (options?.identifierOnly) {
        return projectFormFieldIsDirty("identifier", values, baseline);
      }
      return (
        projectFormFieldIsDirty("name", values, baseline) ||
        projectFormFieldIsDirty("identifier", values, baseline) ||
        projectFormFieldIsDirty("description", values, baseline)
      );
    case "styleGuide":
      return projectFormFieldIsDirty("translationContext", values, baseline);
    case "locales":
      return (
        projectFormFieldIsDirty("sourceLocale", values, baseline) ||
        projectFormFieldIsDirty("targetLocales", values, baseline)
      );
  }
}

const PROJECT_SETTINGS_SECTION_FIELDS: Record<ProjectSettingsSection, (keyof ProjectFormValues)[]> =
  {
    general: ["name", "identifier", "description"],
    styleGuide: ["translationContext"],
    locales: ["sourceLocale", "targetLocales"],
  };

export function validateProjectSettingsSection(
  section: ProjectSettingsSection,
  values: ProjectFormValues,
  options?: { requireIdentifier?: boolean; intl?: ProjectFormIntl },
): ProjectFormErrors {
  const allErrors = validateProjectForm(values, {
    requireLocales: section === "locales",
    requireIdentifier: section === "general" && (options?.requireIdentifier ?? true),
    intl: options?.intl,
  });
  const errors: ProjectFormErrors = {};

  for (const field of PROJECT_SETTINGS_SECTION_FIELDS[section]) {
    const message = allErrors[field];
    if (message) {
      errors[field] = message;
    }
  }

  return errors;
}

export function mergeProjectSettingsSectionErrors(
  current: ProjectFormErrors,
  section: ProjectSettingsSection,
  nextErrors: ProjectFormErrors,
): ProjectFormErrors {
  const next = { ...current };

  for (const field of PROJECT_SETTINGS_SECTION_FIELDS[section]) {
    if (nextErrors[field]) {
      next[field] = nextErrors[field];
    } else {
      delete next[field];
    }
  }

  return next;
}

export function toProjectSectionPayload(
  values: ProjectFormValues,
  section: ProjectSettingsSection,
  options?: { identifierOnly?: boolean },
): ProjectUpdatePayload {
  switch (section) {
    case "general": {
      const identifier = values.identifier.trim().toUpperCase();
      if (options?.identifierOnly) {
        return identifier ? { identifier } : {};
      }
      return {
        name: values.name.trim(),
        description: values.description.trim(),
        ...(identifier ? { identifier } : {}),
      };
    }
    case "styleGuide":
      return {
        translationContext: values.translationContext.trim(),
      };
    case "locales":
      return buildLocalePayload(values);
  }
}

export function applyProjectSettingsSection(
  current: ProjectFormValues,
  saved: ProjectFormValues,
  section: ProjectSettingsSection,
): ProjectFormValues {
  switch (section) {
    case "general":
      return {
        ...current,
        name: saved.name.trim(),
        identifier: saved.identifier.trim().toUpperCase(),
        description: saved.description.trim(),
      };
    case "styleGuide":
      return {
        ...current,
        translationContext: saved.translationContext.trim(),
      };
    case "locales":
      return {
        ...current,
        sourceLocale: saved.sourceLocale,
        targetLocales: [...saved.targetLocales],
      };
  }
}

export function reconcileProjectForm(
  current: ProjectFormValues,
  baseline: ProjectFormValues,
  project: ProjectListRow,
): { values: ProjectFormValues; baseline: ProjectFormValues } {
  const nextBaseline = createProjectFormFromRow(project);

  return {
    baseline: nextBaseline,
    values: {
      name: projectFormFieldIsDirty("name", current, baseline) ? current.name : nextBaseline.name,
      identifier: projectFormFieldIsDirty("identifier", current, baseline)
        ? current.identifier
        : nextBaseline.identifier,
      description: projectFormFieldIsDirty("description", current, baseline)
        ? current.description
        : nextBaseline.description,
      translationContext: projectFormFieldIsDirty("translationContext", current, baseline)
        ? current.translationContext
        : nextBaseline.translationContext,
      sourceLocale: projectFormFieldIsDirty("sourceLocale", current, baseline)
        ? current.sourceLocale
        : nextBaseline.sourceLocale,
      targetLocales: projectFormFieldIsDirty("targetLocales", current, baseline)
        ? current.targetLocales
        : nextBaseline.targetLocales,
    },
  };
}

export function projectFormRequiresLocales(
  mode: "create" | "edit",
  source: ProjectListRow["source"],
) {
  return mode === "create" || source === "native";
}

export function formatProjectLocaleSummary(
  sourceLocale: string | null,
  targetLocales: string[],
  intl?: ProjectFormIntl,
) {
  if (!sourceLocale && targetLocales.length === 0) {
    return resolveMessage(intl, projectFormMessages.noLocalesConfigured);
  }

  const source = sourceLocale ? (canonicalizeLocale(sourceLocale) ?? sourceLocale) : "—";
  const targets =
    targetLocales.length > 0
      ? targetLocales.map((locale) => canonicalizeLocale(locale) ?? locale).join(", ")
      : "—";

  return resolveMessage(intl, projectFormMessages.localeSummary, { source, targets });
}

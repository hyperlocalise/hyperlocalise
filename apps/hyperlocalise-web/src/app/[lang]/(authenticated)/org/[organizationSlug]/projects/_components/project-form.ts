/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { IntlShape } from "@formatjs/intl";

import { canonicalizeLocale, normalizeProjectLocales } from "@/lib/i18n/locales";

import { projectFormMessages } from "./project-form.messages";
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
  options?: { requireLocales?: boolean; intl?: ProjectFormIntl },
): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  const name = values.name.trim();
  const requireLocales = options?.requireLocales ?? true;
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

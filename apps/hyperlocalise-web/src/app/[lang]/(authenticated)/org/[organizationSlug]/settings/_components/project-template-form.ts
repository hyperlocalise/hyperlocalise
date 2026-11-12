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

import type {
  ApprovedTranslationsOnSourceChange,
  ProjectTemplateBody,
  ProjectTemplateRecord,
} from "@/lib/go-svc/go-svc-client.types";
import { normalizeProjectLocales } from "@/lib/i18n/locales";

import { projectTemplateFormMessages as messages } from "./project-template-form.messages";

export const PROJECT_TEMPLATE_NAME_MAX = 200;
export const PROJECT_TEMPLATE_DESCRIPTION_MAX = 2_000;
export const PROJECT_TEMPLATE_PROJECT_DESCRIPTION_MAX = 10_000;
export const PROJECT_TEMPLATE_TRANSLATION_CONTEXT_MAX = 20_000;
export const PROJECT_TEMPLATE_RESOURCES_MAX = 50;

export type ProjectTemplateFormValues = {
  name: string;
  description: string;
  sourceLocale: string;
  targetLocales: string[];
  projectDescription: string;
  translationContext: string;
  teamId: string | null;
  automaticallyGroupIdenticalStrings: boolean;
  sourceTextEditable: boolean;
  approvedTranslationsOnSourceChange: ApprovedTranslationsOnSourceChange;
  /** Highest priority first. */
  memoryIds: string[];
  /** Highest priority first. */
  glossaryIds: string[];
};

export type ProjectTemplateFormErrors = Partial<Record<keyof ProjectTemplateFormValues, string>>;

/** A glossary the template can attach; only glossaries in the source locale fit. */
export type ProjectTemplateGlossaryOption = { id: string; name: string; sourceLocale: string };

export function createEmptyProjectTemplateForm(): ProjectTemplateFormValues {
  return {
    name: "",
    description: "",
    sourceLocale: "en-US",
    targetLocales: [],
    projectDescription: "",
    translationContext: "",
    teamId: null,
    automaticallyGroupIdenticalStrings: false,
    sourceTextEditable: false,
    approvedTranslationsOnSourceChange: "stay_approved",
    memoryIds: [],
    glossaryIds: [],
  };
}

export function projectTemplateFormFromRecord(
  template: ProjectTemplateRecord,
): ProjectTemplateFormValues {
  return {
    name: template.name,
    description: template.description,
    sourceLocale: template.sourceLocale,
    targetLocales: [...template.targetLocales],
    projectDescription: template.projectDescription,
    translationContext: template.translationContext,
    teamId: template.teamId,
    automaticallyGroupIdenticalStrings: template.automaticallyGroupIdenticalStrings,
    sourceTextEditable: template.sourceTextEditable,
    approvedTranslationsOnSourceChange: template.approvedTranslationsOnSourceChange,
    memoryIds: [...template.memoryIds],
    glossaryIds: [...template.glossaryIds],
  };
}

/** Adds the ID at the end (lowest priority) or removes it, keeping the others in order. */
export function toggleOrderedId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/** Drops glossaries whose source locale no longer matches, as the server would reject them. */
export function keepGlossariesForSourceLocale(
  glossaryIds: readonly string[],
  glossaries: readonly ProjectTemplateGlossaryOption[],
  sourceLocale: string,
): string[] {
  const localeById = new Map(glossaries.map((glossary) => [glossary.id, glossary.sourceLocale]));
  return glossaryIds.filter((id) => {
    const locale = localeById.get(id);
    return locale === undefined || locale === sourceLocale;
  });
}

export function validateProjectTemplateForm(
  values: ProjectTemplateFormValues,
  intl: Pick<IntlShape, "formatMessage">,
): ProjectTemplateFormErrors {
  const errors: ProjectTemplateFormErrors = {};
  const name = values.name.trim();
  if (!name) {
    errors.name = intl.formatMessage(messages.nameRequired);
  } else if (name.length > PROJECT_TEMPLATE_NAME_MAX) {
    errors.name = intl.formatMessage(messages.tooLong, { max: PROJECT_TEMPLATE_NAME_MAX });
  }
  if (values.description.length > PROJECT_TEMPLATE_DESCRIPTION_MAX) {
    errors.description = intl.formatMessage(messages.tooLong, {
      max: PROJECT_TEMPLATE_DESCRIPTION_MAX,
    });
  }
  if (values.projectDescription.length > PROJECT_TEMPLATE_PROJECT_DESCRIPTION_MAX) {
    errors.projectDescription = intl.formatMessage(messages.tooLong, {
      max: PROJECT_TEMPLATE_PROJECT_DESCRIPTION_MAX,
    });
  }
  if (values.translationContext.length > PROJECT_TEMPLATE_TRANSLATION_CONTEXT_MAX) {
    errors.translationContext = intl.formatMessage(messages.tooLong, {
      max: PROJECT_TEMPLATE_TRANSLATION_CONTEXT_MAX,
    });
  }
  const locales = normalizeProjectLocales({
    sourceLocale: values.sourceLocale,
    targetLocales: values.targetLocales,
  });
  if ("error" in locales) {
    if (locales.error === "invalid_source_locale") {
      errors.sourceLocale = intl.formatMessage(messages.invalidSourceLocale);
    } else if (locales.error === "source_in_targets") {
      errors.targetLocales = intl.formatMessage(messages.sourceInTargets);
    } else {
      errors.targetLocales = intl.formatMessage(messages.targetLocalesRequired);
    }
  }
  if (values.memoryIds.length > PROJECT_TEMPLATE_RESOURCES_MAX) {
    errors.memoryIds = intl.formatMessage(messages.tooManyResources, {
      max: PROJECT_TEMPLATE_RESOURCES_MAX,
    });
  }
  if (values.glossaryIds.length > PROJECT_TEMPLATE_RESOURCES_MAX) {
    errors.glossaryIds = intl.formatMessage(messages.tooManyResources, {
      max: PROJECT_TEMPLATE_RESOURCES_MAX,
    });
  }
  return errors;
}

/** The full body for create or update. Call after validateProjectTemplateForm passes. */
export function toProjectTemplateBody(values: ProjectTemplateFormValues): ProjectTemplateBody {
  const locales = normalizeProjectLocales({
    sourceLocale: values.sourceLocale,
    targetLocales: values.targetLocales,
  });
  if ("error" in locales) {
    throw new Error(locales.error);
  }
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    sourceLocale: locales.sourceLocale,
    targetLocales: locales.targetLocales,
    projectDescription: values.projectDescription.trim(),
    translationContext: values.translationContext.trim(),
    teamId: values.teamId,
    automaticallyGroupIdenticalStrings: values.automaticallyGroupIdenticalStrings,
    sourceTextEditable: values.sourceTextEditable,
    approvedTranslationsOnSourceChange: values.approvedTranslationsOnSourceChange,
    memoryIds: values.memoryIds,
    glossaryIds: values.glossaryIds,
  };
}

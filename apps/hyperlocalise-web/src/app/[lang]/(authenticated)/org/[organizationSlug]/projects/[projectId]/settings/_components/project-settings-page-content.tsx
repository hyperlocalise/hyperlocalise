"use client";

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
import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  LanguageSquareIcon,
  Link01Icon,
  QuillWrite01Icon,
  SaveIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/markdown-editor/markdown-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { isEncodedProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";

import {
  applyProjectSettingsSection,
  createProjectFormFromRow,
  mergeProjectSettingsSectionErrors,
  projectFormHasErrors,
  projectSettingsSectionIsDirty,
  reconcileProjectForm,
  toProjectSectionPayload,
  validateProjectSettingsSection,
  type ProjectFormErrors,
  type ProjectFormValues,
  type ProjectSettingsSection,
} from "../../../_components/project-form";
import type { ProjectListRow } from "../../../_components/project-list";
import {
  ProjectSourceLocalePicker,
  ProjectTargetLocalesPicker,
} from "../../../_components/project-locale-picker";
import {
  ProjectPageShell,
  ProjectSectionHeader,
  useProjectPageQuery,
} from "../../_components/project-page-shell";
import { ProjectIssueTemplatesPanel } from "./project-issue-templates-panel";
import { ProjectNativeConnectCliPanel } from "./project-native-connect-cli-panel";
import { ProjectIssueColumnsSettings } from "./project-issue-columns-settings";
import { ProjectContentEditorBehaviorSettings } from "./project-content-editor-behavior-settings";
import { projectSettingsPageContentMessages } from "./project-settings-page-content.messages";
import { ProjectSettingsSectionHeading } from "./project-settings-section-heading";

const providerLabels: Record<NonNullable<ProjectListRow["externalProviderKind"]>, string> = {
  crowdin: "Crowdin",
  smartling: "Smartling",
  phrase: "Phrase",
  lokalise: "Lokalise",
};

const projectPageQueryKey = (organizationSlug: string, projectId: string) => [
  "translation-project",
  organizationSlug,
  projectId,
];

const projectsQueryKey = (organizationSlug: string) => ["translation-projects", organizationSlug];

async function readProjectError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object") {
    if ("message" in body && typeof body.message === "string") {
      return body.message;
    }
    if ("error" in body && typeof body.error === "string") {
      return body.error;
    }
  }

  return fallback;
}

const PROJECT_FORM_FIELD_ORDER: (keyof ProjectFormValues)[] = [
  "name",
  "identifier",
  "description",
  "translationContext",
  "sourceLocale",
  "targetLocales",
];

const PROJECT_FORM_FIELD_FOCUS_IDS: Partial<Record<keyof ProjectFormValues, string>> = {
  name: "project-name",
  identifier: "project-identifier",
  description: "project-description",
  translationContext: "translation-context",
};

/** Stable fingerprint of server-backed form fields so refetches do not wipe edits. */
function projectFormFingerprint(project: ProjectListRow) {
  return [
    project.id,
    project.updated,
    project.name,
    project.identifier,
    project.descriptionValue,
    project.translationContextValue,
    project.sourceLocale ?? "",
    project.targetLocales.join(","),
  ].join("\0");
}

function firstProjectFormErrorMessage(errors: ProjectFormErrors) {
  for (const key of PROJECT_FORM_FIELD_ORDER) {
    const message = errors[key];
    if (message) {
      return message;
    }
  }
  return undefined;
}

function focusFirstProjectFormError(errors: ProjectFormErrors) {
  for (const key of PROJECT_FORM_FIELD_ORDER) {
    if (!errors[key]) {
      continue;
    }

    const fieldId = PROJECT_FORM_FIELD_FOCUS_IDS[key];
    if (fieldId) {
      const element = document.getElementById(fieldId);
      if (element) {
        element.focus({ preventScroll: true });
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    const alert = document.querySelector<HTMLElement>("[data-slot=field-error]");
    alert?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  const intl = useIntl();

  return (
    <div className="min-w-0">
      <TypographyP
        className="tracking-[0.08em]"
        size="xsmall"
        weight="medium"
        tone="subtle"
        capitalization="uppercase"
      >
        {label}
      </TypographyP>
      <TypographyP className="mt-1" lineClamp={1} size="small" tone="subtlest">
        {value ?? intl.formatMessage(projectSettingsPageContentMessages.emptyValue)}
      </TypographyP>
    </div>
  );
}

function ProjectSettingsSectionSave({
  isSaving,
  disabled,
  ariaLabel,
}: {
  isSaving: boolean;
  disabled: boolean;
  ariaLabel: string;
}) {
  return (
    <Button type="submit" disabled={disabled || isSaving} aria-label={ariaLabel}>
      {isSaving ? (
        <Spinner />
      ) : (
        <HugeiconsIcon icon={SaveIcon} className="size-4" strokeWidth={2} />
      )}
      {isSaving ? (
        <FormattedMessage {...projectSettingsPageContentMessages.saving} />
      ) : (
        <FormattedMessage {...projectSettingsPageContentMessages.saveSettings} />
      )}
    </Button>
  );
}

function ProjectSourceDetails({ project }: { project: ProjectListRow }) {
  if (project.source === "native") {
    return null;
  }

  const providerUrl = sanitizeExternalUrl(project.externalProjectUrl);

  return (
    <section className="rounded-lg border border-border bg-muted p-4">
      <ProjectSettingsSectionHeading
        icon={Link01Icon}
        tone="beam"
        title={<FormattedMessage {...projectSettingsPageContentMessages.sourceConnectionTitle} />}
        description={
          <FormattedMessage {...projectSettingsPageContentMessages.sourceConnectionDescription} />
        }
        actions={
          project.externalProviderKind ? (
            <Badge variant="outline">{providerLabels[project.externalProviderKind]}</Badge>
          ) : null
        }
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <DetailRow label="External project ID" value={project.externalProjectId} />
        <DetailRow label="Status" value={project.isActive ? "Active" : "Inactive"} />
      </div>
      {providerUrl ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          nativeButton={false}
          render={<a href={providerUrl} target="_blank" rel="noopener noreferrer" />}
        >
          <FormattedMessage {...projectSettingsPageContentMessages.openInProvider} />
        </Button>
      ) : null}
    </section>
  );
}

export function ProjectSettingsPageContent({
  organizationSlug,
  projectId,
  canManageCatBehavior,
}: {
  organizationSlug: string;
  projectId: string;
  canManageCatBehavior: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const project = projectQuery.data;
  const [values, setValues] = useState<ProjectFormValues | null>(null);
  const [baseline, setBaseline] = useState<ProjectFormValues | null>(null);
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const [syncedFingerprint, setSyncedFingerprint] = useState<string | null>(null);
  const valuesRef = useRef(values);
  const baselineRef = useRef(baseline);
  valuesRef.current = values;
  baselineRef.current = baseline;

  useEffect(() => {
    if (!project) {
      return;
    }

    const fingerprint = projectFormFingerprint(project);
    if (fingerprint === syncedFingerprint) {
      return;
    }

    const currentValues = valuesRef.current;
    const currentBaseline = baselineRef.current;
    if (currentValues && currentBaseline) {
      const reconciled = reconcileProjectForm(currentValues, currentBaseline, project);
      setValues(reconciled.values);
      setBaseline(reconciled.baseline);
    } else {
      const next = createProjectFormFromRow(project);
      setValues(next);
      setBaseline(next);
      setErrors({});
    }
    setSyncedFingerprint(fingerprint);
  }, [project, syncedFingerprint]);

  const updateProject = useMutation({
    mutationFn: async ({
      nextValues,
      section,
    }: {
      nextValues: ProjectFormValues;
      section: ProjectSettingsSection;
    }) => {
      if (!project) {
        throw new Error("Project is not loaded yet");
      }

      const payload = toProjectSectionPayload(nextValues, section, {
        identifierOnly: project.source !== "native",
      });

      if (project.source === "native") {
        try {
          return await goSvcClient.project.update(organizationSlug, projectId, payload);
        } catch (error) {
          throw new Error(goSvcErrorMessage(error, "Unable to update project settings"), {
            cause: error,
          });
        }
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$patch({
        param: { organizationSlug, projectId },
        json: payload,
      });

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to update project settings"));
      }

      return response.json();
    },
    onSuccess: async (_result, { nextValues, section }) => {
      setValues((current) =>
        current ? applyProjectSettingsSection(current, nextValues, section) : current,
      );
      setBaseline((current) =>
        current ? applyProjectSettingsSection(current, nextValues, section) : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: projectPageQueryKey(organizationSlug, projectId),
        }),
        queryClient.invalidateQueries({ queryKey: projectsQueryKey(organizationSlug) }),
      ]);
      toast.success(
        intl.formatMessage(
          section === "general"
            ? projectSettingsPageContentMessages.generalSaved
            : section === "styleGuide"
              ? projectSettingsPageContentMessages.styleGuideSaved
              : projectSettingsPageContentMessages.localesSaved,
        ),
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update project settings");
    },
  });

  const savingSection = updateProject.isPending ? updateProject.variables?.section : undefined;
  const metadataEditable = project?.source === "native";

  function updateField<K extends keyof ProjectFormValues>(field: K, value: ProjectFormValues[K]) {
    setValues((current) => (current ? { ...current, [field]: value } : current));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function handleSectionSubmit(section: ProjectSettingsSection) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!values || !project || !baseline) {
        return;
      }

      const identifierOnly = project.source !== "native";
      if (!projectSettingsSectionIsDirty(section, values, baseline, { identifierOnly })) {
        return;
      }

      const nextErrors = validateProjectSettingsSection(section, values, {
        requireIdentifier: true,
        intl,
      });
      setErrors((current) => mergeProjectSettingsSectionErrors(current, section, nextErrors));

      if (projectFormHasErrors(nextErrors)) {
        const message = firstProjectFormErrorMessage(nextErrors);
        if (message) {
          toast.error(message);
        }
        focusFirstProjectFormError(nextErrors);
        return;
      }

      updateProject.mutate({ nextValues: values, section });
    };
  }

  if (projectQuery.isLoading || !values || !baseline) {
    return (
      <ProjectPageShell>
        <TypographyP size="small" tone="subtle">
          <FormattedMessage {...projectSettingsPageContentMessages.loading} />
        </TypographyP>
      </ProjectPageShell>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <ProjectPageShell>
        <TypographyP className="text-flame-100" size="small">
          <FormattedMessage {...projectSettingsPageContentMessages.loadError} />
        </TypographyP>
      </ProjectPageShell>
    );
  }

  const localesEditable = project.source === "native";
  const identifierOnly = !metadataEditable;
  const generalDirty = projectSettingsSectionIsDirty("general", values, baseline, {
    identifierOnly,
  });
  const styleGuideDirty = projectSettingsSectionIsDirty("styleGuide", values, baseline);
  const localesDirty = projectSettingsSectionIsDirty("locales", values, baseline);

  return (
    <ProjectPageShell>
      <ProjectSectionHeader icon={Settings01Icon} section="Settings" />

      <div className="grid gap-5">
        <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
          <form onSubmit={handleSectionSubmit("general")} className="grid gap-4">
            <ProjectSettingsSectionHeading
              icon={Settings01Icon}
              tone="dew"
              title={<FormattedMessage {...projectSettingsPageContentMessages.generalTitle} />}
              description={
                <FormattedMessage {...projectSettingsPageContentMessages.generalDescription} />
              }
              actions={
                !metadataEditable ? (
                  <Badge variant="outline">
                    <FormattedMessage {...projectSettingsPageContentMessages.readOnly} />
                  </Badge>
                ) : null
              }
            />
            <Field className="gap-1.5">
              <FieldLabel htmlFor="project-name">
                <FormattedMessage {...projectSettingsPageContentMessages.nameLabel} />
              </FieldLabel>
              <Input
                id="project-name"
                value={values.name}
                disabled={savingSection === "general" || !metadataEditable}
                onChange={(event) => updateField("name", event.target.value)}
                aria-invalid={Boolean(errors.name)}
              />
              <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="project-identifier">
                <FormattedMessage {...projectSettingsPageContentMessages.identifierLabel} />
              </FieldLabel>
              <Input
                id="project-identifier"
                value={values.identifier}
                disabled={savingSection === "general"}
                className="font-mono uppercase"
                onChange={(event) => updateField("identifier", event.target.value.toUpperCase())}
                aria-invalid={Boolean(errors.identifier)}
              />
              <FieldDescription>
                <FormattedMessage {...projectSettingsPageContentMessages.identifierHelp} />
              </FieldDescription>
              <FieldError
                errors={errors.identifier ? [{ message: errors.identifier }] : undefined}
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="project-description">
                <FormattedMessage {...projectSettingsPageContentMessages.descriptionLabel} />
              </FieldLabel>
              <Textarea
                id="project-description"
                value={values.description}
                disabled={savingSection === "general" || !metadataEditable}
                onChange={(event) => updateField("description", event.target.value)}
                aria-invalid={Boolean(errors.description)}
                className="min-h-24"
              />
              <FieldDescription>
                <FormattedMessage {...projectSettingsPageContentMessages.descriptionHelp} />
              </FieldDescription>
              <FieldError
                errors={errors.description ? [{ message: errors.description }] : undefined}
              />
            </Field>
            <ProjectSettingsSectionSave
              isSaving={savingSection === "general"}
              disabled={!generalDirty}
              ariaLabel={intl.formatMessage(projectSettingsPageContentMessages.saveGeneralSettings)}
            />
          </form>
        </section>

        {metadataEditable ? (
          <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
            <form onSubmit={handleSectionSubmit("styleGuide")} className="grid gap-4">
              <ProjectSettingsSectionHeading
                icon={QuillWrite01Icon}
                tone="grove"
                title={<FormattedMessage {...projectSettingsPageContentMessages.styleGuideTitle} />}
                description={
                  <FormattedMessage {...projectSettingsPageContentMessages.styleGuideDescription} />
                }
              />
              <Field className="gap-1.5" data-invalid={Boolean(errors.translationContext)}>
                <MarkdownEditor
                  id="translation-context"
                  value={values.translationContext}
                  disabled={savingSection === "styleGuide"}
                  onChange={(translationContext) =>
                    updateField("translationContext", translationContext)
                  }
                  ariaLabel={intl.formatMessage(projectSettingsPageContentMessages.styleGuideLabel)}
                  placeholder={intl.formatMessage(
                    projectSettingsPageContentMessages.styleGuidePlaceholder,
                  )}
                  className="[&_.tiptap]:min-h-36"
                />
                <FieldError
                  errors={
                    errors.translationContext ? [{ message: errors.translationContext }] : undefined
                  }
                />
              </Field>
              <ProjectSettingsSectionSave
                isSaving={savingSection === "styleGuide"}
                disabled={!styleGuideDirty}
                ariaLabel={intl.formatMessage(
                  projectSettingsPageContentMessages.saveStyleGuideSettings,
                )}
              />
            </form>
          </section>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
          <form onSubmit={handleSectionSubmit("locales")} className="grid gap-4">
            <ProjectSettingsSectionHeading
              icon={LanguageSquareIcon}
              tone="spruce"
              title={<FormattedMessage {...projectSettingsPageContentMessages.localesTitle} />}
              description={
                localesEditable ? (
                  <FormattedMessage
                    {...projectSettingsPageContentMessages.localesEditableDescription}
                  />
                ) : (
                  <FormattedMessage
                    {...projectSettingsPageContentMessages.localesReadOnlyDescription}
                  />
                )
              }
              actions={
                !localesEditable ? (
                  <Badge variant="outline">
                    <FormattedMessage {...projectSettingsPageContentMessages.readOnly} />
                  </Badge>
                ) : null
              }
            />
            {localesEditable ? (
              <>
                <ProjectSourceLocalePicker
                  value={values.sourceLocale}
                  onChange={(sourceLocale) => updateField("sourceLocale", sourceLocale)}
                  disabled={savingSection === "locales"}
                  error={errors.sourceLocale}
                />
                <ProjectTargetLocalesPicker
                  value={values.targetLocales}
                  sourceLocale={values.sourceLocale}
                  onChange={(targetLocales) => updateField("targetLocales", targetLocales)}
                  disabled={savingSection === "locales"}
                  error={errors.targetLocales}
                />
                <ProjectSettingsSectionSave
                  isSaving={savingSection === "locales"}
                  disabled={!localesDirty}
                  ariaLabel={intl.formatMessage(
                    projectSettingsPageContentMessages.saveLocalesSettings,
                  )}
                />
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Source locale" value={project.sourceLocale} />
                <DetailRow
                  label="Target locales"
                  value={project.targetLocales.length > 0 ? project.targetLocales.join(", ") : null}
                />
              </div>
            )}
          </form>
        </section>

        <ProjectSourceDetails project={project} />

        {/* Live (unsynced) external-TMS projects have no row in `projects` — id is an encoded
            "ext:provider:externalId" string, not a real project — so there is nowhere to persist
            a template config. Rendering the panel there would let an admin "save" a config that
            silently never took effect. */}
        {!isEncodedProviderProjectId(project.id) ? (
          <ProjectIssueTemplatesPanel organizationSlug={organizationSlug} projectId={projectId} />
        ) : null}

        {project.source === "native" ? (
          <ProjectNativeConnectCliPanel organizationSlug={organizationSlug} projectId={projectId} />
        ) : null}
      </div>

      {/* Live provider projects have no persisted project row for CAT policy. */}
      {!isEncodedProviderProjectId(project.id) ? (
        <div className="mt-5">
          <ProjectContentEditorBehaviorSettings
            organizationSlug={organizationSlug}
            projectId={projectId}
            canManage={canManageCatBehavior}
          />
        </div>
      ) : null}

      <div className="mt-5">
        <ProjectIssueColumnsSettings organizationSlug={organizationSlug} projectId={projectId} />
      </div>
    </ProjectPageShell>
  );
}

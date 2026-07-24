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
import { type FormEvent, useEffect, useState } from "react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { SaveIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { sanitizeExternalUrl } from "@/lib/security/safe-external-url";
import { useAppShellHeaderAction } from "@/components/app-shell/store/use-app-shell-header-action";

import {
  createProjectFormFromRow,
  projectFormHasErrors,
  projectFormRequiresLocales,
  toProjectPayload,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormValues,
} from "../../../_components/project-form";
import type { ProjectListRow } from "../../../_components/project-list";
import {
  ProjectSourceLocalePicker,
  ProjectTargetLocalesPicker,
} from "../../../_components/project-locale-picker";
import {
  ProjectPageShell,
  ProjectSectionHeader,
  ProjectSectionTitle,
  useProjectPageQuery,
} from "../../_components/project-page-shell";
import { ProjectNativeConnectCliPanel } from "./project-native-connect-cli-panel";
import { projectSettingsPageContentMessages } from "./project-settings-page-content.messages";

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

function DetailRow({ label, value }: { label: string; value: string | null }) {
  const intl = useIntl();

  return (
    <div className="min-w-0">
      <TypographyP className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </TypographyP>
      <TypographyP className="mt-1 truncate text-sm text-subtle-foreground">
        {value ?? intl.formatMessage(projectSettingsPageContentMessages.emptyValue)}
      </TypographyP>
    </div>
  );
}

function ProjectSourceDetails({ project }: { project: ProjectListRow }) {
  if (project.source === "native") {
    return null;
  }

  const providerUrl = sanitizeExternalUrl(project.externalProjectUrl);

  return (
    <section className="rounded-lg border border-border bg-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <ProjectSectionTitle>
            <FormattedMessage {...projectSettingsPageContentMessages.sourceConnectionTitle} />
          </ProjectSectionTitle>
          <TypographyP className="mt-1 text-sm text-muted-foreground">
            <FormattedMessage {...projectSettingsPageContentMessages.sourceConnectionDescription} />
          </TypographyP>
        </div>
        {project.externalProviderKind ? (
          <Badge variant="outline">{providerLabels[project.externalProviderKind]}</Badge>
        ) : null}
      </div>
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
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const project = projectQuery.data;
  const [values, setValues] = useState<ProjectFormValues | null>(null);
  const [errors, setErrors] = useState<ProjectFormErrors>({});

  useEffect(() => {
    if (project) {
      setValues(createProjectFormFromRow(project));
      setErrors({});
    }
  }, [project]);

  const updateProject = useMutation({
    mutationFn: async (nextValues: ProjectFormValues) => {
      if (!project) {
        throw new Error("Project is not loaded yet");
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$patch({
        param: { organizationSlug, projectId },
        json: toProjectPayload(nextValues, {
          mode: "edit",
          includeLocales: project.source === "native",
        }),
      });

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to update project settings"));
      }

      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: projectPageQueryKey(organizationSlug, projectId),
        }),
        queryClient.invalidateQueries({ queryKey: projectsQueryKey(organizationSlug) }),
      ]);
      toast.success("Project settings saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update project settings");
    },
  });

  const isSaving = updateProject.isPending;
  const settingsEditable = project?.source === "native";
  // Issue identifier is Hyperlocalise-owned metadata and stays editable for TMS projects.
  const canSaveSettings = Boolean(project);
  useAppShellHeaderAction({
    id: "project-settings-save",
    visible: canSaveSettings,
    render: () => (
      <Button type="submit" form="project-settings-form" disabled={isSaving}>
        {isSaving ? <Spinner /> : <SaveIcon className="size-4" strokeWidth={2} />}
        {isSaving ? (
          <FormattedMessage {...projectSettingsPageContentMessages.saving} />
        ) : (
          <FormattedMessage {...projectSettingsPageContentMessages.saveSettings} />
        )}
      </Button>
    ),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || !project) return;

    const nextErrors = validateProjectForm(values, {
      requireLocales: projectFormRequiresLocales("edit", project.source),
    });
    setErrors(nextErrors);

    if (projectFormHasErrors(nextErrors)) {
      return;
    }

    updateProject.mutate(values);
  }

  if (projectQuery.isLoading || !values) {
    return (
      <ProjectPageShell>
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...projectSettingsPageContentMessages.loading} />
        </TypographyP>
      </ProjectPageShell>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <ProjectPageShell>
        <TypographyP className="text-sm text-flame-100">
          <FormattedMessage {...projectSettingsPageContentMessages.loadError} />
        </TypographyP>
      </ProjectPageShell>
    );
  }

  const localesEditable = project.source === "native";

  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={Settings01Icon}
        section="Settings"
        description={
          settingsEditable
            ? "Edit project metadata, translation guidance, locales, and source connection details."
            : "View provider-managed project metadata, locales, and source connection details."
        }
      />

      <form id="project-settings-form" onSubmit={handleSubmit} className="grid gap-5">
        <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <ProjectSectionTitle>
                <FormattedMessage {...projectSettingsPageContentMessages.generalTitle} />
              </ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                <FormattedMessage {...projectSettingsPageContentMessages.generalDescription} />
              </TypographyP>
            </div>
            {!settingsEditable ? (
              <Badge variant="outline">
                <FormattedMessage {...projectSettingsPageContentMessages.readOnly} />
              </Badge>
            ) : null}
          </div>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="project-name">
              <FormattedMessage {...projectSettingsPageContentMessages.nameLabel} />
            </FieldLabel>
            <Input
              id="project-name"
              value={values.name}
              disabled={isSaving || !settingsEditable}
              onChange={(event) =>
                setValues((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
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
              disabled={isSaving}
              onChange={(event) =>
                setValues((current) =>
                  current ? { ...current, identifier: event.target.value.toUpperCase() } : current,
                )
              }
              aria-invalid={Boolean(errors.identifier)}
              className="font-mono uppercase"
              maxLength={10}
            />
            <FieldDescription>
              <FormattedMessage {...projectSettingsPageContentMessages.identifierHelp} />
            </FieldDescription>
            <FieldError errors={errors.identifier ? [{ message: errors.identifier }] : undefined} />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="project-description">
              <FormattedMessage {...projectSettingsPageContentMessages.descriptionLabel} />
            </FieldLabel>
            <Textarea
              id="project-description"
              value={values.description}
              disabled={isSaving || !settingsEditable}
              onChange={(event) =>
                setValues((current) =>
                  current ? { ...current, description: event.target.value } : current,
                )
              }
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
        </section>

        {settingsEditable ? (
          <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
            <div>
              <ProjectSectionTitle>
                <FormattedMessage
                  {...projectSettingsPageContentMessages.translationGuidanceTitle}
                />
              </ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                <FormattedMessage
                  {...projectSettingsPageContentMessages.translationGuidanceDescription}
                />
              </TypographyP>
            </div>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="translation-context">
                <FormattedMessage {...projectSettingsPageContentMessages.guidanceLabel} />
              </FieldLabel>
              <Textarea
                id="translation-context"
                value={values.translationContext}
                disabled={isSaving}
                onChange={(event) =>
                  setValues((current) =>
                    current ? { ...current, translationContext: event.target.value } : current,
                  )
                }
                aria-invalid={Boolean(errors.translationContext)}
                className="min-h-36"
                placeholder="Example: Keep product names in English. Use concise UI copy. Prefer informal tone for marketing pages."
              />
              <FieldError
                errors={
                  errors.translationContext ? [{ message: errors.translationContext }] : undefined
                }
              />
            </Field>
          </section>
        ) : null}

        <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <ProjectSectionTitle>
                <FormattedMessage {...projectSettingsPageContentMessages.localesTitle} />
              </ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-muted-foreground">
                {localesEditable ? (
                  <FormattedMessage
                    {...projectSettingsPageContentMessages.localesEditableDescription}
                  />
                ) : (
                  <FormattedMessage
                    {...projectSettingsPageContentMessages.localesReadOnlyDescription}
                  />
                )}
              </TypographyP>
            </div>
            {!localesEditable ? (
              <Badge variant="outline">
                <FormattedMessage {...projectSettingsPageContentMessages.readOnly} />
              </Badge>
            ) : null}
          </div>
          {localesEditable ? (
            <>
              <ProjectSourceLocalePicker
                value={values.sourceLocale}
                onChange={(sourceLocale) =>
                  setValues((current) => (current ? { ...current, sourceLocale } : current))
                }
                disabled={isSaving}
                error={errors.sourceLocale}
              />
              <ProjectTargetLocalesPicker
                value={values.targetLocales}
                sourceLocale={values.sourceLocale}
                onChange={(targetLocales) =>
                  setValues((current) => (current ? { ...current, targetLocales } : current))
                }
                disabled={isSaving}
                error={errors.targetLocales}
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
        </section>

        <ProjectSourceDetails project={project} />

        {project.source === "native" ? (
          <ProjectNativeConnectCliPanel organizationSlug={organizationSlug} projectId={projectId} />
        ) : null}
      </form>
    </ProjectPageShell>
  );
}

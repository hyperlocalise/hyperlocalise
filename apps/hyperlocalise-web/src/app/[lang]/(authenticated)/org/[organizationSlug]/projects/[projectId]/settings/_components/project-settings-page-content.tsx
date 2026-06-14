"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { SaveIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  return (
    <div className="min-w-0">
      <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
        {label}
      </TypographyP>
      <TypographyP className="mt-1 truncate text-sm text-foreground/72">{value ?? "—"}</TypographyP>
    </div>
  );
}

function ProjectSourceDetails({ project }: { project: ProjectListRow }) {
  if (project.source === "native") {
    return null;
  }

  const providerUrl = sanitizeExternalUrl(project.externalProjectUrl);

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <ProjectSectionTitle>Source connection</ProjectSectionTitle>
          <TypographyP className="mt-1 text-sm text-foreground/52">
            External TMS projects inherit source data and locales from the connected provider.
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
          Open in provider
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
        <TypographyP className="text-sm text-foreground/52">
          Loading project settings...
        </TypographyP>
      </ProjectPageShell>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <ProjectPageShell>
        <TypographyP className="text-sm text-flame-100">
          Failed to load project settings.
        </TypographyP>
      </ProjectPageShell>
    );
  }

  const isSaving = updateProject.isPending;
  const localesEditable = project.source === "native";
  const settingsEditable = project.source === "native";

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
        actions={
          settingsEditable ? (
            <Button type="submit" form="project-settings-form" disabled={isSaving}>
              {isSaving ? <Spinner /> : <SaveIcon className="size-4" strokeWidth={2} />}
              {isSaving ? "Saving..." : "Save settings"}
            </Button>
          ) : null
        }
      />

      <form id="project-settings-form" onSubmit={handleSubmit} className="grid gap-5">
        <section className="grid gap-4 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <ProjectSectionTitle>General</ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-foreground/52">
                Name the project and capture operational notes for the team.
              </TypographyP>
            </div>
            {!settingsEditable ? <Badge variant="outline">Read-only</Badge> : null}
          </div>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="project-name">Name</FieldLabel>
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
            <FieldLabel htmlFor="project-description">Description</FieldLabel>
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
              Use this for project scope, release, and ownership notes.
            </FieldDescription>
            <FieldError
              errors={errors.description ? [{ message: errors.description }] : undefined}
            />
          </Field>
        </section>

        {settingsEditable ? (
          <section className="grid gap-4 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
            <div>
              <ProjectSectionTitle>Translation guidance</ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-foreground/52">
                Shared instructions for tone, terminology, formatting, and product context.
              </TypographyP>
            </div>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="translation-context">Guidance</FieldLabel>
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

        <section className="grid gap-4 rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <ProjectSectionTitle>Locales</ProjectSectionTitle>
              <TypographyP className="mt-1 text-sm text-foreground/52">
                {localesEditable
                  ? "Edit the source locale and target locales for this native project."
                  : "Locales are managed by the connected TMS provider."}
              </TypographyP>
            </div>
            {!localesEditable ? <Badge variant="outline">Read-only</Badge> : null}
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
      </form>
    </ProjectPageShell>
  );
}

"use client";

import { type FormEvent, useEffect, useState } from "react";
import { TranslateIcon } from "@hugeicons/core-free-icons";
import { PencilIcon, SaveIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api-client-instance";
import { getLocaleLabel, isRtlLocale, normalizeProjectLocales } from "@/lib/i18n/locales";

import {
  defaultNativeProjectSourceLocale,
  defaultNativeProjectTargetLocales,
  type ProjectFormErrors,
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

const externalTmsProviderLabels: Record<
  NonNullable<ProjectListRow["externalProviderKind"]>,
  string
> = {
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

  if (body && typeof body === "object" && "error" in body) {
    return String(body.error);
  }

  return fallback;
}

export function ProjectLocalesPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const project = projectQuery.data;
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={TranslateIcon}
        section="Locales"
        description="Source and target locales for this program. Native projects can edit locales here; external TMS projects inherit locales from the connected provider."
        actions={
          project?.source === "native" ? (
            <Button
              type="button"
              onClick={() => setIsEditDialogOpen(true)}
              className="w-full sm:w-fit"
            >
              <PencilIcon className="size-4" strokeWidth={2} />
              Edit locales
            </Button>
          ) : null
        }
        meta={
          project?.source === "external_tms" && project.externalProviderKind ? (
            <Badge variant="outline">
              {externalTmsProviderLabels[project.externalProviderKind] ??
                project.externalProviderKind}
            </Badge>
          ) : null
        }
      />

      {projectQuery.isLoading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : project ? (
        <section
          aria-label="Project locales"
          className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground"
        >
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">Source locale</p>
            <p className="mt-1 text-base font-medium text-foreground">
              {project.sourceLocale ?? "Not configured"}
            </p>
            {project.sourceLocale ? (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {getLocaleLabel(project.sourceLocale)}
              </p>
            ) : null}
          </div>

          <div className="px-5 py-4">
            <p className="text-xs font-medium text-muted-foreground">
              Target locales ({project.targetLocales.length})
            </p>
            {project.targetLocales.length > 0 ? (
              <ul className="mt-3 divide-y divide-border">
                {project.targetLocales.map((locale) => (
                  <li
                    key={locale}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="font-medium text-foreground">{locale}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {getLocaleLabel(locale)}
                      </span>
                      {isRtlLocale(locale) ? (
                        <Badge variant="outline" className="text-[10px]">
                          RTL
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No target locales configured yet.
              </p>
            )}
          </div>

          {project.source === "external_tms" && project.lastSyncedAt ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              Last synced from provider: {project.lastSyncedAt}
            </p>
          ) : null}
        </section>
      ) : null}
      {project ? (
        <ProjectLocalesDialog
          open={isEditDialogOpen}
          project={project}
          organizationSlug={organizationSlug}
          projectId={projectId}
          onOpenChange={setIsEditDialogOpen}
        />
      ) : null}
    </ProjectPageShell>
  );
}

function ProjectLocalesDialog({
  open,
  project,
  organizationSlug,
  projectId,
  onOpenChange,
}: {
  open: boolean;
  project: ProjectListRow;
  organizationSlug: string;
  projectId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [sourceLocale, setSourceLocale] = useState(
    project.sourceLocale ?? defaultNativeProjectSourceLocale,
  );
  const [targetLocales, setTargetLocales] = useState(
    project.targetLocales.length > 0
      ? project.targetLocales
      : [...defaultNativeProjectTargetLocales],
  );
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const updateLocales = useMutation({
    mutationFn: async () => {
      const normalized = normalizeProjectLocales({
        sourceLocale,
        targetLocales,
      });

      if ("error" in normalized) {
        throw new Error(normalized.error);
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"].$patch({
        param: { organizationSlug, projectId },
        json: {
          sourceLocale: normalized.sourceLocale,
          targetLocales: normalized.targetLocales,
        },
      });

      if (!response.ok) {
        throw new Error(await readProjectError(response, "Unable to update locales"));
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
      onOpenChange(false);
      toast.success("Locales updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setSourceLocale(project.sourceLocale ?? defaultNativeProjectSourceLocale);
    setTargetLocales(
      project.targetLocales.length > 0
        ? project.targetLocales
        : [...defaultNativeProjectTargetLocales],
    );
    setErrors({});
  }, [open, project.sourceLocale, project.targetLocales]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized = normalizeProjectLocales({ sourceLocale, targetLocales });
    if ("error" in normalized) {
      if (normalized.error === "invalid_source_locale") {
        setErrors({ sourceLocale: "Select a valid source locale." });
      } else if (normalized.error === "source_in_targets") {
        setErrors({ targetLocales: "Remove the source locale from target locales." });
      } else {
        setErrors({ targetLocales: "Select at least one valid target locale." });
      }
      return;
    }

    setErrors({});
    updateLocales.mutate();
  }

  const isSaving = updateLocales.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[min(85dvh,40rem)] flex-col gap-0 overflow-hidden rounded-xl border border-foreground/10 bg-background p-0 text-foreground sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 gap-2 border-b border-foreground/8 px-6 pt-6 pe-12 pb-4">
            <DialogTitle className="text-foreground">Edit locales</DialogTitle>
            <DialogDescription className="text-foreground/52">
              Update the source locale and target locales for this native project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4">
            <ProjectSourceLocalePicker
              value={sourceLocale}
              onChange={setSourceLocale}
              disabled={isSaving}
              error={errors.sourceLocale}
            />
            <ProjectTargetLocalesPicker
              value={targetLocales}
              sourceLocale={sourceLocale}
              onChange={setTargetLocales}
              disabled={isSaving}
              error={errors.targetLocales}
            />
          </div>
          <DialogFooter className="shrink-0 border-t border-foreground/8 px-6 pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner /> : <SaveIcon className="size-4" strokeWidth={2} />}
              {isSaving ? "Saving..." : "Save locales"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

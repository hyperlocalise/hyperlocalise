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
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { MemoryProjectRecord, MemoryRecord } from "@/api/routes/memory/memory.schema";
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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

import { TmEntryExplorer } from "./tm-entry-explorer";
import { TmEntryLocaleField } from "./tm-entry-locale-field";
import { TmImportExportPanel } from "./tm-import-export-panel";
import { buildTmEntryLocaleOptions } from "./tm-entry-list-state";
import { TM_ENTRY_SEARCH_QUERY_KEY } from "./tm-entry-search";
import { translationMemoryDetailPageContentMessages as messages } from "./translation-memory-detail-page-content.messages";

type EntryForm = {
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  targetText: string;
};

const emptyEntryForm: EntryForm = {
  sourceLocale: "en-US",
  targetLocale: "fr-FR",
  sourceText: "",
  targetText: "",
};

export function TranslationMemoryDetailPageContent({
  organizationSlug,
  memoryId,
  canManageMemories,
}: {
  organizationSlug: string;
  memoryId: string;
  canManageMemories: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const memoryQuery = useQuery({
    queryKey: ["translation-memory", organizationSlug, memoryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].$get({ param: { organizationSlug, memoryId } });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadMemoryFailed)),
        );
      const body = await response.json();
      return body.memory as MemoryRecord;
    },
  });

  const attachedProjectsQuery = useQuery({
    queryKey: ["translation-memory-projects", organizationSlug, memoryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].projects.$get({ param: { organizationSlug, memoryId } });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadProjectsFailed)),
        );
      const body = await response.json();
      return body.projects as MemoryProjectRecord[];
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (response.status !== 200)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadProjectsFailed)),
        );
      const body = await response.json();
      return body.projects;
    },
  });

  const invalidateEntries = () =>
    queryClient.invalidateQueries({
      queryKey: [TM_ENTRY_SEARCH_QUERY_KEY, organizationSlug, memoryId],
    });
  const invalidateProjects = () =>
    queryClient.invalidateQueries({
      queryKey: ["translation-memory-projects", organizationSlug, memoryId],
    });

  const saveEntry = useMutation({
    mutationFn: async (values: EntryForm) => {
      const payload = {
        sourceLocale: values.sourceLocale.trim(),
        targetLocale: values.targetLocale.trim(),
        sourceText: values.sourceText.trim(),
        targetText: values.targetText.trim(),
        matchScore: 100,
      };
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries.$post({
        param: { organizationSlug, memoryId },
        json: payload,
      });
      if (!response.ok)
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveEntryFailed)));
      return response.json();
    },
    onSuccess: async () => {
      await invalidateEntries();
      setEntryForm(emptyEntryForm);
      setAddEntryOpen(false);
      toast.success(intl.formatMessage(messages.entryAdded));
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (entryId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries[":entryId"].$delete({ param: { organizationSlug, memoryId, entryId } });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.deleteEntryFailed)),
        );
    },
    onSuccess: async () => {
      await invalidateEntries();
      toast.success(intl.formatMessage(messages.entryDeleted));
    },
    onError: (error) => toast.error(error.message),
  });

  const attachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].projects.$post({ param: { organizationSlug, memoryId }, json: { projectId, priority: 0 } });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.assignProjectFailed)),
        );
      return response.json();
    },
    onSuccess: async () => {
      await invalidateProjects();
      setSelectedProjectId("");
      toast.success(intl.formatMessage(messages.projectAssigned));
    },
    onError: (error) => toast.error(error.message),
  });

  const detachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].projects[":projectId"].$delete({ param: { organizationSlug, memoryId, projectId } });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.removeProjectFailed)),
        );
    },
    onSuccess: async () => {
      await invalidateProjects();
      toast.success(intl.formatMessage(messages.projectRemoved));
    },
    onError: (error) => toast.error(error.message),
  });

  const memory = memoryQuery.data;
  const isNative = memory?.source === "native";
  const canEdit = canManageMemories && isNative && memory?.capabilityMode !== "reference_only";
  const attachedProjectIds = useMemo(
    () => new Set((attachedProjectsQuery.data ?? []).map((project) => project.projectId)),
    [attachedProjectsQuery.data],
  );
  const availableProjects = (projectsQuery.data ?? []).filter(
    (project) => !attachedProjectIds.has(project.id),
  );

  if (memoryQuery.isLoading) {
    return (
      <TypographyP className="py-8 text-sm text-muted-foreground">
        <FormattedMessage {...messages.loading} />
      </TypographyP>
    );
  }
  if (!memory) {
    return (
      <TypographyP className="py-8 text-sm text-muted-foreground">
        <FormattedMessage {...messages.notFound} />
      </TypographyP>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Link
        href={`/org/${organizationSlug}/translation-memories`}
        className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        <FormattedMessage {...messages.backToList} />
      </Link>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TypographyH1 className="font-sans text-2xl font-medium">{memory.name}</TypographyH1>
          <Badge variant="outline">
            {memory.source === "native" ? (
              <FormattedMessage {...messages.sourceWorkspace} />
            ) : (
              <FormattedMessage {...messages.sourceProvider} />
            )}
          </Badge>
        </div>
        {memory.description ? (
          <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {memory.description}
          </TypographyP>
        ) : null}
      </section>

      <TmEntryExplorer
        organizationSlug={organizationSlug}
        memoryId={memoryId}
        localeCoverage={memory.localeCoverage}
        canEdit={canEdit}
        canManageMemories={canManageMemories}
        isDeleting={deleteEntry.isPending}
        onDeleteEntry={(entryId) => deleteEntry.mutate(entryId)}
        toolbarActions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setProjectsOpen(true)}>
              <FormattedMessage {...messages.projectsToolbar} />
            </Button>
            <TmImportExportPanel
              organizationSlug={organizationSlug}
              memoryId={memoryId}
              localeCoverage={memory.localeCoverage}
              canEdit={canEdit}
              onImported={invalidateEntries}
            />
            {canEdit ? (
              <Button type="button" size="sm" onClick={() => setAddEntryOpen(true)}>
                <FormattedMessage {...messages.addEntry} />
              </Button>
            ) : null}
          </>
        }
      />

      <Dialog
        open={addEntryOpen}
        onOpenChange={(open) => {
          setAddEntryOpen(open);
          if (!open) {
            setEntryForm(emptyEntryForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.addEntryDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.addEntryDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <TmEntryLocaleField
              label={intl.formatMessage(messages.sourceLocaleLabel)}
              value={entryForm.sourceLocale}
              locales={buildTmEntryLocaleOptions({
                localeCoverage: memory.localeCoverage,
                selected: entryForm.sourceLocale,
              })}
              onValueChange={(locale) =>
                setEntryForm((current) => ({
                  ...current,
                  sourceLocale: locale,
                }))
              }
            />
            <TmEntryLocaleField
              label={intl.formatMessage(messages.targetLocaleLabel)}
              value={entryForm.targetLocale}
              locales={buildTmEntryLocaleOptions({
                localeCoverage: memory.localeCoverage,
                selected: entryForm.targetLocale,
              })}
              onValueChange={(locale) =>
                setEntryForm((current) => ({
                  ...current,
                  targetLocale: locale,
                }))
              }
            />
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.sourceTextLabel} />
              </FieldLabel>
              <Textarea
                value={entryForm.sourceText}
                onChange={(event) =>
                  setEntryForm((current) => ({ ...current, sourceText: event.target.value }))
                }
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.targetTextLabel} />
              </FieldLabel>
              <Textarea
                value={entryForm.targetText}
                onChange={(event) =>
                  setEntryForm((current) => ({ ...current, targetText: event.target.value }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddEntryOpen(false);
                setEntryForm(emptyEntryForm);
              }}
            >
              <FormattedMessage {...messages.cancelAddEntry} />
            </Button>
            <Button
              type="button"
              disabled={
                !entryForm.sourceText.trim() ||
                !entryForm.targetText.trim() ||
                !entryForm.sourceLocale.trim() ||
                !entryForm.targetLocale.trim() ||
                saveEntry.isPending
              }
              onClick={() => saveEntry.mutate(entryForm)}
            >
              <FormattedMessage {...messages.addEntry} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.assignedProjectsTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.assignedProjectsDescription} />
            </DialogDescription>
          </DialogHeader>
          {canEdit ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                value={selectedProjectId || null}
                onValueChange={(value) => setSelectedProjectId(value ?? "")}
              >
                <SelectTrigger className="sm:max-w-sm">
                  <SelectValue
                    placeholder={intl.formatMessage(messages.selectProjectPlaceholder)}
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id} label={project.name}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedProjectId || attachProject.isPending}
                onClick={() => attachProject.mutate(selectedProjectId)}
              >
                <FormattedMessage {...messages.assignToProject} />
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2">
            {(attachedProjectsQuery.data ?? []).map((project) => (
              <div
                key={project.projectId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <Link
                  href={`/org/${organizationSlug}/projects/${project.projectId}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {project.projectName}
                </Link>
                {canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => detachProject.mutate(project.projectId)}
                  >
                    <FormattedMessage {...messages.removeProject} />
                  </Button>
                ) : null}
              </div>
            ))}
            {attachedProjectsQuery.isSuccess && (attachedProjectsQuery.data ?? []).length === 0 ? (
              <TypographyP className="text-sm text-muted-foreground">
                <FormattedMessage {...messages.noProjectsAssigned} />
              </TypographyP>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

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
import { ArrowLeft01Icon, DatabaseSyncIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type {
  MemoryEntryRecord,
  MemoryProjectRecord,
  MemoryRecord,
} from "@/api/routes/memory/memory.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");

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

  const entriesQuery = useQuery({
    queryKey: ["translation-memory-entries", organizationSlug, memoryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries.$get({
        param: { organizationSlug, memoryId },
        query: { limit: "50", offset: "0" },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.loadEntriesFailed)),
        );
      const body = await response.json();
      return body.memoryEntries as MemoryEntryRecord[];
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
      queryKey: ["translation-memory-entries", organizationSlug, memoryId],
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
      const response = editingEntryId
        ? await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
            ":memoryId"
          ].entries[":entryId"].$patch({
            param: { organizationSlug, memoryId, entryId: editingEntryId },
            json: payload,
          })
        : await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
            ":memoryId"
          ].entries.$post({
            param: { organizationSlug, memoryId },
            json: payload,
          });
      if (!response.ok)
        throw new Error(await readApiError(response, intl.formatMessage(messages.saveEntryFailed)));
      return { body: await response.json(), wasEditing: Boolean(editingEntryId) };
    },
    onSuccess: async ({ wasEditing }) => {
      await invalidateEntries();
      setEntryForm(emptyEntryForm);
      setEditingEntryId(null);
      toast.success(intl.formatMessage(wasEditing ? messages.entryUpdated : messages.entryAdded));
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

  const importEntries = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".tmx") ? "tmx" : "csv";
      const response = await apiClient.api.orgs[":organizationSlug"]["translation-memories"][
        ":memoryId"
      ].entries["import"].$post({
        param: { organizationSlug, memoryId },
        json: { format, content },
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, intl.formatMessage(messages.importEntriesFailed)),
        );
      return response.json();
    },
    onSuccess: async (body) => {
      await invalidateEntries();
      toast.success(intl.formatMessage(messages.entriesImported, { count: body.imported ?? 0 }));
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
  const canEdit = canManageMemories && isNative;
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={DatabaseSyncIcon}
            className="size-5 text-muted-foreground"
            strokeWidth={1.8}
          />
          <Badge variant="outline">
            {memory.source === "native" ? (
              <FormattedMessage {...messages.sourceWorkspace} />
            ) : (
              <FormattedMessage {...messages.sourceProvider} />
            )}
          </Badge>
        </div>
        <TypographyH1 className="font-sans text-2xl font-medium">{memory.name}</TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {memory.description || intl.formatMessage(messages.descriptionFallback)}
        </TypographyP>
      </section>

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.entriesTitle} />
            </TypographyP>
            <TypographyP className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.entriesDescription} />
            </TypographyP>
          </div>
          {canEdit ? (
            <Input
              type="file"
              accept=".csv,.tmx,text/csv"
              className="max-w-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importEntries.mutate(file);
                event.currentTarget.value = "";
              }}
            />
          ) : null}
        </div>

        {canEdit ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.sourceLocaleLabel} />
              </FieldLabel>
              <Input
                value={entryForm.sourceLocale}
                onChange={(event) =>
                  setEntryForm((current) => ({ ...current, sourceLocale: event.target.value }))
                }
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.targetLocaleLabel} />
              </FieldLabel>
              <Input
                value={entryForm.targetLocale}
                onChange={(event) =>
                  setEntryForm((current) => ({ ...current, targetLocale: event.target.value }))
                }
              />
            </Field>
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
            <div className="flex gap-2 md:col-span-2">
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
                {editingEntryId ? (
                  <FormattedMessage {...messages.updateEntry} />
                ) : (
                  <FormattedMessage {...messages.addEntry} />
                )}
              </Button>
              {editingEntryId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingEntryId(null);
                    setEntryForm(emptyEntryForm);
                  }}
                >
                  <FormattedMessage {...messages.cancelEdit} />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border">
          {(entriesQuery.data ?? []).map((entry) => (
            <div
              key={entry.id}
              className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-center"
            >
              <div>
                <TypographyP className="text-sm font-medium">{entry.sourceText}</TypographyP>
                <TypographyP className="text-xs text-muted-foreground">
                  <FormattedMessage
                    {...messages.localePair}
                    values={{
                      sourceLocale: entry.sourceLocale,
                      targetLocale: entry.targetLocale,
                    }}
                  />
                </TypographyP>
              </div>
              <TypographyP className="text-sm text-subtle-foreground">
                {entry.targetText}
              </TypographyP>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingEntryId(entry.id);
                      setEntryForm({
                        sourceLocale: entry.sourceLocale,
                        targetLocale: entry.targetLocale,
                        sourceText: entry.sourceText,
                        targetText: entry.targetText,
                      });
                    }}
                  >
                    <FormattedMessage {...messages.editEntry} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteEntry.mutate(entry.id)}
                  >
                    <FormattedMessage {...messages.deleteEntry} />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {entriesQuery.isSuccess && (entriesQuery.data ?? []).length === 0 ? (
            <TypographyP className="px-4 py-6 text-sm text-muted-foreground">
              <FormattedMessage {...messages.noEntries} />
            </TypographyP>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-border p-4">
        <div>
          <TypographyP className="text-sm font-medium text-foreground">
            <FormattedMessage {...messages.assignedProjectsTitle} />
          </TypographyP>
          <TypographyP className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.assignedProjectsDescription} />
          </TypographyP>
        </div>
        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={selectedProjectId}
              onValueChange={(value) => setSelectedProjectId(value ?? "")}
            >
              <SelectTrigger className="sm:max-w-sm">
                <SelectValue placeholder={intl.formatMessage(messages.selectProjectPlaceholder)} />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
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
      </section>
    </main>
  );
}

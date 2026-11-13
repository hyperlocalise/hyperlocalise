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
"use client";

import { useMemo, useState } from "react";
import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import type { ProjectTemplateRecord } from "@/lib/go-svc/go-svc-client.types";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { projectTemplatesQueryKey } from "@/lib/projects/project-templates/project-templates-query-key";

import { ProjectTemplateDialog } from "./project-template-dialog";
import {
  createEmptyProjectTemplateForm,
  projectTemplateFormFromRecord,
  toProjectTemplateBody,
  type ProjectTemplateFormValues,
} from "./project-template-form";
import { projectTemplatesPageContentMessages as messages } from "./project-templates-page-content.messages";
import { SettingsPageBody, SettingsPageHeader } from "./settings-page-chrome";

const RESOURCE_PAGE_SIZE = 100;

type DialogState = { mode: "create" } | { mode: "edit"; template: ProjectTemplateRecord } | null;

export function ProjectTemplatesPageContent({
  organizationSlug,
  canManage,
}: {
  organizationSlug: string;
  canManage: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client } = useGoSvcClient();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<ProjectTemplateRecord | null>(null);

  const templatesQuery = useQuery({
    queryKey: projectTemplatesQueryKey(organizationSlug),
    queryFn: async () => {
      try {
        return (await client.projectTemplate.list(organizationSlug)).projectTemplates;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadFailed)), {
          cause: error,
        });
      }
    },
  });

  // Pickers for the editor; only managers open it.
  const resourcesQuery = useQuery({
    queryKey: ["project-template-resources", organizationSlug],
    enabled: canManage,
    queryFn: async () => {
      const [teams, memories, glossaries] = await Promise.all([
        client.team.list(organizationSlug),
        client.memory.list(organizationSlug, { limit: RESOURCE_PAGE_SIZE }),
        client.glossary.list(organizationSlug, { limit: RESOURCE_PAGE_SIZE }),
      ]);
      return {
        teams: teams.teams.map((team) => ({ id: team.id, name: team.name })),
        memories: memories.memories.map((memory) => ({ id: memory.id, name: memory.name })),
        glossaries: glossaries.glossaries.map((glossary) => ({
          id: glossary.id,
          name: glossary.name,
          sourceLocale: glossary.sourceLocale,
        })),
      };
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: projectTemplatesQueryKey(organizationSlug) });

  const saveTemplate = useMutation({
    mutationFn: async ({
      values,
      templateId,
    }: {
      values: ProjectTemplateFormValues;
      templateId?: string;
    }) => {
      try {
        const body = toProjectTemplateBody(values);
        return templateId
          ? await client.projectTemplate.update(organizationSlug, templateId, body)
          : await client.projectTemplate.create(organizationSlug, body);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.saveFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: () => {
      void invalidate();
      setDialog(null);
      toast.success(intl.formatMessage(messages.saved));
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      try {
        await client.projectTemplate.delete(organizationSlug, templateId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.deleteFailed)), {
          cause: error,
        });
      }
    },
    onSuccess: () => {
      void invalidate();
      setDeleting(null);
      toast.success(intl.formatMessage(messages.deleted));
    },
    onError: (error) => toast.error(error.message),
  });

  const initialValues = useMemo(
    () =>
      dialog?.mode === "edit"
        ? projectTemplateFormFromRecord(dialog.template)
        : createEmptyProjectTemplateForm(),
    [dialog],
  );
  const memoryNames = new Map(
    (resourcesQuery.data?.memories ?? []).map((memory) => [memory.id, memory.name]),
  );
  const glossaryNames = new Map(
    (resourcesQuery.data?.glossaries ?? []).map((glossary) => [glossary.id, glossary.name]),
  );
  const templates = templatesQuery.data ?? [];

  return (
    <SettingsPageBody>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SettingsPageHeader title={intl.formatMessage(messages.pageTitle)} />
          <TypographyP className="mt-1 max-w-2xl" size="small" tone="subtle">
            <FormattedMessage {...messages.pageDescription} />
          </TypographyP>
        </div>
        {canManage ? (
          <Button type="button" className="shrink-0" onClick={() => setDialog({ mode: "create" })}>
            <PlusIcon data-icon="inline-start" />
            <FormattedMessage {...messages.addButton} />
          </Button>
        ) : null}
      </div>

      {templatesQuery.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : templatesQuery.isError ? (
        <TypographyP size="small" tone="subtle">
          {templatesQuery.error.message}
        </TypographyP>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...(canManage ? messages.emptyManager : messages.emptyMember)} />
          </TypographyP>
        </div>
      ) : (
        <ul className="grid gap-3">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-4"
            >
              <div className="grid min-w-0 flex-1 gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{template.name}</p>
                  {template.description ? (
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  ) : null}
                </div>
                <p className="text-sm">
                  {intl.formatMessage(messages.locales, {
                    source: template.sourceLocale,
                    targets: intl.formatList(template.targetLocales, { type: "conjunction" }),
                  })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {template.memoryIds.map((id) => (
                    <Badge key={id} variant="secondary">
                      {intl.formatMessage(messages.memoryBadge, {
                        name: memoryNames.get(id) ?? intl.formatMessage(messages.unnamedResource),
                      })}
                    </Badge>
                  ))}
                  {template.glossaryIds.map((id) => (
                    <Badge key={id} variant="outline">
                      {intl.formatMessage(messages.glossaryBadge, {
                        name: glossaryNames.get(id) ?? intl.formatMessage(messages.unnamedResource),
                      })}
                    </Badge>
                  ))}
                </div>
              </div>
              {canManage ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDialog({ mode: "edit", template })}
                  >
                    <PencilSimpleIcon data-icon="inline-start" />
                    <FormattedMessage {...messages.edit} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={intl.formatMessage(messages.deleteLabel, { name: template.name })}
                    onClick={() => setDeleting(template)}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ProjectTemplateDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialValues={initialValues}
        teams={resourcesQuery.data?.teams ?? []}
        memories={resourcesQuery.data?.memories ?? []}
        glossaries={resourcesQuery.data?.glossaries ?? []}
        isSaving={saveTemplate.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        onSubmit={(values) =>
          saveTemplate.mutate({
            values,
            templateId: dialog?.mode === "edit" ? dialog.template.id : undefined,
          })
        }
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteTemplate.isPending) {
            setDeleting(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.deleteTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {intl.formatMessage(messages.deleteDescription, { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTemplate.isPending}>
              <FormattedMessage {...messages.cancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteTemplate.isPending || !deleting}
              onClick={() => {
                if (deleting) {
                  deleteTemplate.mutate(deleting.id);
                }
              }}
            >
              {deleteTemplate.isPending ? <Spinner /> : <TrashIcon />}
              <FormattedMessage {...messages.deleteConfirm} />
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageBody>
  );
}

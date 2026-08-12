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
import { type FormEvent, useMemo, useState } from "react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  EyeIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";
import {
  canDeleteIssueSheetColumn,
  isIssueSheetProtectedColumnKey,
} from "@/lib/projects/issue-sheet/issue-sheet-column-guards";

import {
  ISSUE_SHEET_SYSTEM_FIELD_DEFINITIONS,
  type IssueSheetColumn,
} from "../../../../_components/issue-detail/issue-sheet-column-types";
import {
  issueSheetColumnsQueryKey,
  useIssueSheetColumnsQuery,
} from "../../../../_components/issue-detail/use-issue-sheet-columns-query";
import { ProjectSectionTitle } from "../../_components/project-page-shell";
import { projectIssueColumnsSettingsMessages as messages } from "./project-issue-columns-settings.messages";

const COLUMN_TYPE_VALUES = ["text", "long_text", "select", "user"] as const;

function issueSheetColumnsPath(organizationSlug: string, projectId: string) {
  return `/api/orgs/${organizationSlug}/projects/${projectId}/issue-sheet/columns`;
}

function formString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" ? value : fallback;
}

async function readJsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await readApiResponseError(response, fallback);
    throw new Error(error.message || fallback);
  }
  return (await response.json()) as T;
}

function columnTypeLabel(intl: ReturnType<typeof useIntl>, type: string) {
  switch (type) {
    case "text":
      return intl.formatMessage(messages.typeText);
    case "long_text":
      return intl.formatMessage(messages.typeLongText);
    case "select":
      return intl.formatMessage(messages.typeSelect);
    case "user":
      return intl.formatMessage(messages.typeUser);
    case "enrichment":
      return intl.formatMessage(messages.typeEnrichment);
    default:
      return type;
  }
}

function optionsToCsv(column: IssueSheetColumn) {
  return (column.config.options ?? []).map((option) => option.label).join(", ");
}

function parseOptionsCsv(raw: string) {
  return raw
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option) => ({ id: option, label: option }));
}

export function ProjectIssueColumnsSettings({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const columnsQuery = useIssueSheetColumnsQuery({ organizationSlug, projectId });
  const [createOpen, setCreateOpen] = useState(false);
  const [renameColumn, setRenameColumn] = useState<IssueSheetColumn | null>(null);
  const [optionsColumn, setOptionsColumn] = useState<IssueSheetColumn | null>(null);
  const [deleteColumn, setDeleteColumn] = useState<IssueSheetColumn | null>(null);

  const columns = columnsQuery.data ?? [];
  const builtInColumns = useMemo(
    () => columns.filter((column) => isIssueSheetProtectedColumnKey(column.key)),
    [columns],
  );
  const customColumns = useMemo(
    () => columns.filter((column) => canDeleteIssueSheetColumn(column)),
    [columns],
  );

  async function invalidateColumns() {
    await queryClient.invalidateQueries({
      queryKey: issueSheetColumnsQueryKey(organizationSlug, projectId),
    });
    await queryClient.invalidateQueries({
      queryKey: ["issue-sheet", organizationSlug, projectId],
    });
  }

  const patchColumn = useMutation({
    mutationFn: async (input: {
      columnId: string;
      body: {
        label?: string;
        hidden?: boolean;
        config?: { options?: { id: string; label: string }[] };
      };
    }) => {
      const response = await fetch(
        `${issueSheetColumnsPath(organizationSlug, projectId)}/${input.columnId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.body),
        },
      );
      return readJsonOrThrow<{ column: IssueSheetColumn }>(
        response,
        intl.formatMessage(messages.toastError),
      );
    },
    onSuccess: async (_data, variables) => {
      await invalidateColumns();
      if (variables.body.hidden === true) {
        toast.success(intl.formatMessage(messages.toastHidden));
      } else if (variables.body.hidden === false) {
        toast.success(intl.formatMessage(messages.toastShown));
      } else {
        toast.success(intl.formatMessage(messages.toastUpdated));
      }
      setRenameColumn(null);
      setOptionsColumn(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.toastError));
    },
  });

  const reorderColumns = useMutation({
    mutationFn: async (columnIds: string[]) => {
      const response = await fetch(`${issueSheetColumnsPath(organizationSlug, projectId)}/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnIds }),
      });
      return readJsonOrThrow<{ columns: IssueSheetColumn[] }>(
        response,
        intl.formatMessage(messages.toastError),
      );
    },
    onSuccess: async () => {
      await invalidateColumns();
      toast.success(intl.formatMessage(messages.toastReordered));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.toastError));
    },
  });

  const removeColumn = useMutation({
    mutationFn: async (columnId: string) => {
      const response = await fetch(
        `${issueSheetColumnsPath(organizationSlug, projectId)}/${columnId}`,
        { method: "DELETE" },
      );
      if (!response.ok && response.status !== 204) {
        const error = await readApiResponseError(response, intl.formatMessage(messages.toastError));
        throw new Error(error.message || intl.formatMessage(messages.toastError));
      }
    },
    onSuccess: async () => {
      await invalidateColumns();
      toast.success(intl.formatMessage(messages.toastDeleted));
      setDeleteColumn(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.toastError));
    },
  });

  const createColumn = useMutation({
    mutationFn: async (formData: FormData) => {
      const type = formString(formData, "type", "text");
      const rawOptions = formString(formData, "options");
      const response = await fetch(issueSheetColumnsPath(organizationSlug, projectId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: formString(formData, "key").trim(),
          label: formString(formData, "label").trim(),
          type,
          config: type === "select" ? { options: parseOptionsCsv(rawOptions) } : {},
        }),
      });
      return readJsonOrThrow<{ column: IssueSheetColumn }>(
        response,
        intl.formatMessage(messages.toastError),
      );
    },
    onSuccess: async () => {
      await invalidateColumns();
      toast.success(intl.formatMessage(messages.toastCreated));
      setCreateOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.toastError));
    },
  });

  function moveColumn(columnId: string, direction: -1 | 1) {
    const orderedIds = columns.map((column) => column.id);
    const index = orderedIds.indexOf(columnId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) {
      return;
    }
    const next = [...orderedIds];
    const [removed] = next.splice(index, 1);
    next.splice(nextIndex, 0, removed);
    reorderColumns.mutate(next);
  }

  const isBusy =
    patchColumn.isPending ||
    reorderColumns.isPending ||
    removeColumn.isPending ||
    createColumn.isPending;

  function renderColumnRow(column: IssueSheetColumn) {
    const absoluteIndex = columns.findIndex((entry) => entry.id === column.id);
    const canMoveUp = absoluteIndex > 0;
    const canMoveDown = absoluteIndex >= 0 && absoluteIndex < columns.length - 1;
    const deletable = canDeleteIssueSheetColumn(column);
    const canEditOptions = deletable && column.type === "select";

    return (
      <div
        key={column.id}
        className="flex flex-wrap items-center gap-2 border-b border-border py-3 last:border-b-0"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypographyP className="truncate text-sm font-medium text-foreground">
              {column.label}
            </TypographyP>
            <Badge variant="outline">
              {deletable ? (
                <FormattedMessage {...messages.customBadge} />
              ) : (
                <FormattedMessage {...messages.builtInBadge} />
              )}
            </Badge>
            <Badge variant="secondary">{columnTypeLabel(intl, column.type)}</Badge>
            {column.hidden ? (
              <Badge variant="outline">
                <FormattedMessage {...messages.hide} />
              </Badge>
            ) : null}
          </div>
          <TypographyP className="mt-0.5 truncate text-xs text-muted-foreground">
            {column.key}
          </TypographyP>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={isBusy || !canMoveUp}
            aria-label={intl.formatMessage(messages.moveUp)}
            onClick={() => moveColumn(column.id, -1)}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.8} />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={isBusy || !canMoveDown}
            aria-label={intl.formatMessage(messages.moveDown)}
            onClick={() => moveColumn(column.id, 1)}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={isBusy}
            aria-label={intl.formatMessage(column.hidden ? messages.show : messages.hide)}
            onClick={() =>
              patchColumn.mutate({
                columnId: column.id,
                body: { hidden: !column.hidden },
              })
            }
          >
            <HugeiconsIcon icon={column.hidden ? EyeIcon : ViewOffSlashIcon} strokeWidth={1.8} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={() => setRenameColumn(column)}
          >
            <FormattedMessage {...messages.rename} />
          </Button>
          {canEditOptions ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isBusy}
              onClick={() => setOptionsColumn(column)}
            >
              <FormattedMessage {...messages.editOptions} />
            </Button>
          ) : null}
          {deletable ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={isBusy}
              aria-label={intl.formatMessage(messages.delete)}
              onClick={() => setDeleteColumn(column)}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <ProjectSectionTitle>
            <FormattedMessage {...messages.title} />
          </ProjectSectionTitle>
          <TypographyP className="mt-1 text-sm text-muted-foreground">
            <FormattedMessage {...messages.description} />
          </TypographyP>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={isBusy}>
          <FormattedMessage {...messages.addColumn} />
        </Button>
      </div>

      {columnsQuery.isLoading ? (
        <TypographyP className="text-sm text-muted-foreground">
          <FormattedMessage {...messages.loading} />
        </TypographyP>
      ) : null}

      {columnsQuery.isError ? (
        <TypographyP className="text-sm text-flame-100">
          <FormattedMessage {...messages.loadError} />
        </TypographyP>
      ) : null}

      {columnsQuery.isSuccess ? (
        <div className="grid gap-5">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.systemTitle} />
            </TypographyP>
            <TypographyP className="mt-1 text-xs text-muted-foreground">
              <FormattedMessage {...messages.systemDescription} />
            </TypographyP>
            <div className="mt-2 grid gap-2">
              {ISSUE_SHEET_SYSTEM_FIELD_DEFINITIONS.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-b-0"
                >
                  <TypographyP className="text-sm text-foreground">{field.label}</TypographyP>
                  <Badge variant="outline">
                    <FormattedMessage {...messages.builtInBadge} />
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.builtInTitle} />
            </TypographyP>
            <div className="mt-1">{builtInColumns.map((column) => renderColumnRow(column))}</div>
          </div>

          <div>
            <TypographyP className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.customTitle} />
            </TypographyP>
            {customColumns.length === 0 ? (
              <TypographyP className="mt-2 text-sm text-muted-foreground">
                <FormattedMessage {...messages.emptyCustom} />
              </TypographyP>
            ) : (
              <div className="mt-1">{customColumns.map((column) => renderColumnRow(column))}</div>
            )}
          </div>
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              createColumn.mutate(new FormData(event.currentTarget));
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <FormattedMessage {...messages.createTitle} />
              </DialogTitle>
              <DialogDescription>
                <FormattedMessage {...messages.description} />
              </DialogDescription>
            </DialogHeader>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="issue-column-label">
                <FormattedMessage {...messages.labelField} />
              </FieldLabel>
              <Input id="issue-column-label" name="label" required />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="issue-column-key">
                <FormattedMessage {...messages.keyField} />
              </FieldLabel>
              <Input id="issue-column-key" name="key" required pattern="^[a-z][a-z0-9_]*$" />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...messages.typeField} />
              </FieldLabel>
              <Select
                name="type"
                defaultValue="text"
                items={COLUMN_TYPE_VALUES.map((value) => ({
                  value,
                  label: columnTypeLabel(intl, value),
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_TYPE_VALUES.map((value) => (
                    <SelectItem key={value} value={value} label={columnTypeLabel(intl, value)}>
                      {columnTypeLabel(intl, value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="issue-column-options">
                <FormattedMessage {...messages.optionsField} />
              </FieldLabel>
              <Input id="issue-column-options" name="options" />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={createColumn.isPending}>
                {createColumn.isPending ? <Spinner /> : null}
                {createColumn.isPending ? (
                  <FormattedMessage {...messages.creating} />
                ) : (
                  <FormattedMessage {...messages.create} />
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameColumn !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameColumn(null);
          }
        }}
      >
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!renameColumn) {
                return;
              }
              const formData = new FormData(event.currentTarget);
              patchColumn.mutate({
                columnId: renameColumn.id,
                body: { label: formString(formData, "label").trim() },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <FormattedMessage {...messages.renameTitle} />
              </DialogTitle>
            </DialogHeader>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="rename-issue-column-label">
                <FormattedMessage {...messages.labelField} />
              </FieldLabel>
              <Input
                id="rename-issue-column-label"
                name="label"
                required
                defaultValue={renameColumn?.label ?? ""}
              />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={patchColumn.isPending}>
                {patchColumn.isPending ? <Spinner /> : null}
                {patchColumn.isPending ? (
                  <FormattedMessage {...messages.saving} />
                ) : (
                  <FormattedMessage {...messages.save} />
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={optionsColumn !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOptionsColumn(null);
          }
        }}
      >
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!optionsColumn) {
                return;
              }
              const formData = new FormData(event.currentTarget);
              patchColumn.mutate({
                columnId: optionsColumn.id,
                body: {
                  config: {
                    options: parseOptionsCsv(formString(formData, "options")),
                  },
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <FormattedMessage {...messages.editOptionsTitle} />
              </DialogTitle>
            </DialogHeader>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="edit-issue-column-options">
                <FormattedMessage {...messages.optionsField} />
              </FieldLabel>
              <Input
                id="edit-issue-column-options"
                name="options"
                defaultValue={optionsColumn ? optionsToCsv(optionsColumn) : ""}
              />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={patchColumn.isPending}>
                {patchColumn.isPending ? <Spinner /> : null}
                {patchColumn.isPending ? (
                  <FormattedMessage {...messages.saving} />
                ) : (
                  <FormattedMessage {...messages.save} />
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteColumn !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteColumn(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage {...messages.deleteTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteColumn
                ? intl.formatMessage(messages.deleteDescription, { label: deleteColumn.label })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeColumn.isPending}>
              <FormattedMessage {...messages.cancel} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removeColumn.isPending || !deleteColumn}
              onClick={() => {
                if (deleteColumn) {
                  removeColumn.mutate(deleteColumn.id);
                }
              }}
            >
              {removeColumn.isPending ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              )}
              {removeColumn.isPending ? (
                <FormattedMessage {...messages.deleting} />
              ) : (
                <FormattedMessage {...messages.delete} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

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
import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiResponseError, readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import {
  defaultRepositorySourceFileImportSettings,
  normalizeImportSettings,
  sourcePathImportKind,
  type RepositorySourceFileImportSettings,
} from "@/lib/projects/files/source-file-import-settings-schema";

import { projectFileImportSettingsDialogMessages as messages } from "./project-file-import-settings-dialog.messages";

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function columnDraft(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseColumn(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255 ? parsed : null;
}

function importSettingsApi() {
  return apiClient.api.orgs[":organizationSlug"].projects[":projectId"].files["import-settings"];
}

export function ProjectFileImportSettingsDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourcePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const kind = sourcePathImportKind(sourcePath);
  const [draft, setDraft] = useState<RepositorySourceFileImportSettings | null>(null);
  const excludedId = useId();
  const keyPathsId = useId();
  const excludePathsId = useId();
  const contextId = useId();
  const limitId = useId();
  const queryKey = ["project-file-import-settings", organizationSlug, projectId, sourcePath];

  const settingsQuery = useQuery({
    queryKey,
    enabled: open,
    queryFn: async () => {
      const fallback = intl.formatMessage(messages.loadFailed);
      try {
        const response = await importSettingsApi().$get({
          param: { organizationSlug, projectId },
          query: { sourcePath },
        });
        if (response.status !== 200) {
          throw await readApiResponseError(response, fallback);
        }
        const body = await response.json();
        return normalizeImportSettings(body.importSettings);
      } catch (error) {
        if (error instanceof ApiResponseError) {
          throw error;
        }
        throw new Error(fallback, { cause: error instanceof Error ? error : undefined });
      }
    },
  });

  const settings = draft ?? settingsQuery.data ?? defaultRepositorySourceFileImportSettings();
  const loadErrorMessage =
    settingsQuery.error instanceof Error
      ? settingsQuery.error.message
      : intl.formatMessage(messages.loadFailed);

  const saveMutation = useMutation({
    mutationFn: async (value: RepositorySourceFileImportSettings) => {
      const response = await importSettingsApi().$patch({
        param: { organizationSlug, projectId },
        json: { sourcePath, importSettings: value },
      });
      if (response.status !== 200) {
        throw await readApiResponseError(response, intl.formatMessage(messages.saveFailed));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.saveSuccess));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: ["project-file-detail", organizationSlug, projectId, sourcePath],
        }),
      ]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const update = (next: Partial<RepositorySourceFileImportSettings>) => {
    setDraft({
      ...settings,
      ...next,
      html: { ...settings.html, ...next.html },
      json: { ...settings.json, ...next.json },
      excel: {
        ...settings.excel,
        ...next.excel,
        columns: { ...settings.excel.columns, ...next.excel?.columns },
      },
    });
  };

  const htmlExcludedText = useMemo(
    () => settings.html.excludedElements.join("\n"),
    [settings.html.excludedElements],
  );
  const keyPathsText = useMemo(() => settings.json.keyPaths.join("\n"), [settings.json.keyPaths]);
  const excludePathsText = useMemo(
    () => settings.json.excludeKeyPaths.join("\n"),
    [settings.json.excludeKeyPaths],
  );
  const contextFieldsText = useMemo(
    () => settings.json.contextFields.join("\n"),
    [settings.json.contextFields],
  );
  const limitFieldsText = useMemo(
    () => settings.json.characterLimitFields.join("\n"),
    [settings.json.characterLimitFields],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        {settingsQuery.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {loadErrorMessage}
          </p>
        ) : settingsQuery.data == null && draft == null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : kind === null ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.unsupported} />
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
            {kind === "html" ? (
              <>
                <Label htmlFor={excludedId}>
                  <FormattedMessage {...messages.htmlExcludedLabel} />
                </Label>
                <Textarea
                  id={excludedId}
                  value={htmlExcludedText}
                  onChange={(event) =>
                    update({
                      html: { ...settings.html, excludedElements: lines(event.target.value) },
                    })
                  }
                  placeholder={intl.formatMessage(messages.htmlExcludedPlaceholder)}
                  className="max-h-36 font-mono text-sm"
                  spellCheck={false}
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  <FormattedMessage {...messages.htmlExcludedHint} />
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={settings.html.icuSubfilter}
                    onCheckedChange={(checked) =>
                      update({ html: { ...settings.html, icuSubfilter: checked === true } })
                    }
                  />
                  <span>
                    <FormattedMessage {...messages.icuSubfilterLabel} />
                    <span className="mt-1 block text-muted-foreground">
                      <FormattedMessage {...messages.icuSubfilterHint} />
                    </span>
                  </span>
                </label>
              </>
            ) : null}

            {kind === "json" ? (
              <>
                <Label htmlFor={keyPathsId}>
                  <FormattedMessage {...messages.keyPathsLabel} />
                </Label>
                <Textarea
                  id={keyPathsId}
                  value={keyPathsText}
                  onChange={(event) =>
                    update({ json: { ...settings.json, keyPaths: lines(event.target.value) } })
                  }
                  placeholder={intl.formatMessage(messages.keyPathsPlaceholder)}
                  className="max-h-36 font-mono text-sm"
                  spellCheck={false}
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  <FormattedMessage {...messages.keyPathsHint} />
                </p>
                <Label htmlFor={excludePathsId}>
                  <FormattedMessage {...messages.excludeKeyPathsLabel} />
                </Label>
                <Textarea
                  id={excludePathsId}
                  value={excludePathsText}
                  onChange={(event) =>
                    update({
                      json: { ...settings.json, excludeKeyPaths: lines(event.target.value) },
                    })
                  }
                  className="max-h-28 font-mono text-sm"
                  spellCheck={false}
                  rows={2}
                />
                <Label htmlFor={contextId}>
                  <FormattedMessage {...messages.contextFieldsLabel} />
                </Label>
                <Textarea
                  id={contextId}
                  value={contextFieldsText}
                  onChange={(event) =>
                    update({ json: { ...settings.json, contextFields: lines(event.target.value) } })
                  }
                  placeholder={intl.formatMessage(messages.contextFieldsPlaceholder)}
                  className="max-h-28 font-mono text-sm"
                  spellCheck={false}
                  rows={2}
                />
                <p className="text-sm text-muted-foreground">
                  <FormattedMessage {...messages.contextFieldsHint} />
                </p>
                <Label htmlFor={limitId}>
                  <FormattedMessage {...messages.limitFieldsLabel} />
                </Label>
                <Textarea
                  id={limitId}
                  value={limitFieldsText}
                  onChange={(event) =>
                    update({
                      json: { ...settings.json, characterLimitFields: lines(event.target.value) },
                    })
                  }
                  placeholder={intl.formatMessage(messages.limitFieldsPlaceholder)}
                  className="max-h-28 font-mono text-sm"
                  spellCheck={false}
                  rows={2}
                />
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={settings.json.htmlSubfilter}
                    onCheckedChange={(checked) =>
                      update({ json: { ...settings.json, htmlSubfilter: checked === true } })
                    }
                  />
                  <span>
                    <FormattedMessage {...messages.htmlSubfilterLabel} />
                    <span className="mt-1 block text-muted-foreground">
                      <FormattedMessage {...messages.htmlSubfilterHint} />
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={settings.json.icuSubfilter}
                    onCheckedChange={(checked) =>
                      update({ json: { ...settings.json, icuSubfilter: checked === true } })
                    }
                  />
                  <span>
                    <FormattedMessage {...messages.icuSubfilterLabel} />
                    <span className="mt-1 block text-muted-foreground">
                      <FormattedMessage {...messages.icuSubfilterHint} />
                    </span>
                  </span>
                </label>
              </>
            ) : null}

            {kind === "excel" ? (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={settings.excel.firstLineContainsHeader !== false}
                    onCheckedChange={(checked) =>
                      update({
                        excel: {
                          ...settings.excel,
                          firstLineContainsHeader: checked === true,
                        },
                      })
                    }
                  />
                  <span>
                    <FormattedMessage {...messages.excelHeaderLabel} />
                    <span className="mt-1 block text-muted-foreground">
                      <FormattedMessage {...messages.excelHeaderHint} />
                    </span>
                  </span>
                </label>
                {(
                  [
                    ["identifier", messages.excelIdentifierLabel],
                    ["source", messages.excelSourceLabel],
                    ["context", messages.excelContextLabel],
                    ["maxLength", messages.excelMaxLengthLabel],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="flex flex-col gap-1">
                    <Label htmlFor={`excel-${field}`}>
                      <FormattedMessage {...label} />
                    </Label>
                    <Input
                      id={`excel-${field}`}
                      inputMode="numeric"
                      value={columnDraft(settings.excel.columns[field])}
                      onChange={(event) =>
                        update({
                          excel: {
                            ...settings.excel,
                            columns: {
                              ...settings.excel.columns,
                              [field]: parseColumn(event.target.value),
                            },
                          },
                        })
                      }
                      placeholder={intl.formatMessage(messages.excelColumnPlaceholder)}
                    />
                  </div>
                ))}
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          {settingsQuery.isError ? (
            <Button
              type="button"
              disabled={settingsQuery.isFetching}
              onClick={() => {
                void settingsQuery.refetch();
              }}
            >
              {settingsQuery.isFetching ? <Spinner className="size-4" /> : null}
              <FormattedMessage {...messages.retry} />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={kind === null || settingsQuery.data == null || saveMutation.isPending}
              onClick={() => saveMutation.mutate(settings)}
            >
              {saveMutation.isPending ? <Spinner className="size-4" /> : null}
              <FormattedMessage {...messages.save} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

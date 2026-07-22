"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import { createTranslationJobDialogMessages as messages } from "./create-translation-job-dialog.messages";

type CreateTranslationJobDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  sourceLocale: string;
  targetLocales: string[];
  onCreated?: (jobId: string) => void;
};

export function CreateTranslationJobDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  file,
  sourceLocale,
  targetLocales,
  onCreated,
}: CreateTranslationJobDialogProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [selectedLocales, setSelectedLocales] = useState<string[]>(targetLocales);

  useEffect(() => {
    if (open) {
      setSelectedLocales(targetLocales);
    }
  }, [open, targetLocales]);

  const createJob = useMutation({
    mutationFn: async () => {
      if (!file?.storedFileId) {
        throw new Error(intl.formatMessage(messages.uploadSourceRequired));
      }

      const fileFormat = inferSupportedTranslationFileFormat(file.sourcePath);
      if (!fileFormat) {
        throw new Error(intl.formatMessage(messages.unsupportedFormat));
      }

      if (selectedLocales.length === 0) {
        throw new Error(intl.formatMessage(messages.localesRequired));
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.$post({
        param: { organizationSlug, projectId },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: file.storedFileId,
            fileFormat,
            sourceLocale,
            targetLocales: selectedLocales,
          },
        },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.createFailed));
      }

      const body = (await response.json()) as { job: { id: string } };
      return body.job.id;
    },
    onSuccess: async (jobId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", organizationSlug, projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["project-overview-jobs", organizationSlug, projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
      ]);
      toast.success(intl.formatMessage(messages.createSuccess));
      onCreated?.(jobId);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.createFailed),
      );
    },
  });

  function toggleLocale(locale: string) {
    setSelectedLocales((current) =>
      current.includes(locale)
        ? current.filter((entry) => entry !== locale)
        : [...current, locale].toSorted(),
    );
  }

  const pathLabel = file?.sourcePath ?? intl.formatMessage(messages.thisFile);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...messages.description}
              values={{
                path: <span className="font-mono text-foreground">{pathLabel}</span>,
              }}
            />
          </DialogDescription>
        </DialogHeader>

        {targetLocales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.noTargetLocales} />
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <FormattedMessage
                {...messages.sourceLocale}
                values={{
                  locale: <span className="font-medium text-foreground">{sourceLocale}</span>,
                }}
              />
            </p>
            <div className="space-y-2">
              {targetLocales.map((locale) => (
                <label
                  key={locale}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border border-input accent-primary"
                    checked={selectedLocales.includes(locale)}
                    onChange={() => toggleLocale(locale)}
                  />
                  <span>{locale}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={
              createJob.isPending ||
              targetLocales.length === 0 ||
              selectedLocales.length === 0 ||
              !file?.storedFileId
            }
            onClick={() => createJob.mutate()}
          >
            {createJob.isPending ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...messages.submit} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

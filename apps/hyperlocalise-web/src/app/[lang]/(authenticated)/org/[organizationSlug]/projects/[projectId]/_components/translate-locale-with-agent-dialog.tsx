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
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  inferSupportedTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";

import { translateLocaleWithAgentDialogMessages as messages } from "./translate-locale-with-agent-dialog.messages";

const PROJECT_FILES_PAGE_SIZE = 1_000;
const CREATE_JOB_CONCURRENCY = 4;

type AgentTranslatableFile = {
  storedFileId: string;
  fileFormat: SupportedTranslationFileFormat;
};

type CreateJobOutcome = { ok: true } | { ok: false; message: string };

export async function fetchAllProjectFiles(
  fetchPage: (page: { limit: number; offset: number }) => Promise<ProjectFileRecord[]>,
): Promise<ProjectFileRecord[]> {
  const files: ProjectFileRecord[] = [];
  for (;;) {
    const page = await fetchPage({ limit: PROJECT_FILES_PAGE_SIZE, offset: files.length });
    files.push(...page);
    if (page.length < PROJECT_FILES_PAGE_SIZE) {
      return files;
    }
  }
}

export async function queueAgentTranslationJobs<T>(
  items: T[],
  createJob: (item: T) => Promise<CreateJobOutcome>,
  fallbackMessage: string,
) {
  const outcomes = await mapWithConcurrency(
    items,
    CREATE_JOB_CONCURRENCY,
    async (item): Promise<CreateJobOutcome> => {
      try {
        return await createJob(item);
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : fallbackMessage };
      }
    },
  );

  const createdCount = outcomes.filter((outcome) => outcome.ok).length;
  const firstFailure = outcomes.find((outcome) => !outcome.ok);
  return {
    createdCount,
    totalCount: outcomes.length,
    errorMessage: firstFailure && !firstFailure.ok ? firstFailure.message : null,
  };
}

export function selectAgentTranslatableFiles(
  files: readonly ProjectFileRecord[],
): AgentTranslatableFile[] {
  return files.flatMap((file) => {
    if (file.provider || !file.storedFileId) {
      return [];
    }
    const fileFormat = inferSupportedTranslationFileFormat(file.sourcePath);
    return fileFormat ? [{ storedFileId: file.storedFileId, fileFormat }] : [];
  });
}

export function TranslateLocaleWithAgentDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  sourceLocale,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  sourceLocale: string;
  locale: string | null;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const localeLabel = locale ? formatLocaleDisplayName(intl, locale) : "";

  const filesQuery = useQuery({
    queryKey: ["project-files", organizationSlug, projectId, "translate-locale-with-agent"],
    enabled: open,
    queryFn: async () => {
      try {
        return await fetchAllProjectFiles(async (page) => {
          const body = await goSvcClient.project.files(organizationSlug, projectId, page);
          return body.files as ProjectFileRecord[];
        });
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadFilesFailed)), {
          cause: error,
        });
      }
    },
  });

  const files = useMemo(
    () => selectAgentTranslatableFiles(filesQuery.data ?? []),
    [filesQuery.data],
  );

  const createJobs = useMutation({
    mutationFn: (targetLocale: string) =>
      queueAgentTranslationJobs(
        files,
        async (file) => {
          const response = await apiClient.api.orgs[":organizationSlug"].projects[
            ":projectId"
          ].jobs.$post({
            param: { organizationSlug, projectId },
            json: {
              type: "file",
              fileInput: {
                sourceFileId: file.storedFileId,
                fileFormat: file.fileFormat,
                sourceLocale,
                targetLocales: [targetLocale],
                ignoreTranslationMemory: true,
              },
            },
          });
          if (!response.ok) {
            const failure = await readApiResponseError(
              response,
              intl.formatMessage(messages.createFailed),
            );
            return { ok: false, message: failure.message };
          }
          return { ok: true };
        },
        intl.formatMessage(messages.createFailed),
      ),
    onSuccess: async ({ createdCount, totalCount, errorMessage }) => {
      if (createdCount > 0) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["project-overview-jobs", organizationSlug, projectId],
          }),
          queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
          queryClient.invalidateQueries({
            queryKey: ["project-files", organizationSlug, projectId],
          }),
        ]);
      }

      if (createdCount === 0) {
        toast.error(errorMessage ?? intl.formatMessage(messages.createFailed));
        return;
      }

      if (errorMessage) {
        toast.warning(
          intl.formatMessage(messages.createPartial, { createdCount, totalCount, errorMessage }),
        );
      } else {
        toast.success(intl.formatMessage(messages.createSuccess, { count: createdCount }));
      }
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.createFailed),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} values={{ locale: localeLabel }} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} values={{ locale: localeLabel }} />
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {filesQuery.isLoading ? (
            <FormattedMessage {...messages.loadingFiles} />
          ) : filesQuery.isError ? (
            filesQuery.error.message
          ) : files.length === 0 ? (
            <FormattedMessage {...messages.noFiles} />
          ) : (
            <FormattedMessage {...messages.fileCount} values={{ count: files.length }} />
          )}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={!locale || createJobs.isPending || files.length === 0}
            onClick={() => {
              if (locale) {
                createJobs.mutate(locale);
              }
            }}
          >
            {createJobs.isPending ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...messages.submit} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

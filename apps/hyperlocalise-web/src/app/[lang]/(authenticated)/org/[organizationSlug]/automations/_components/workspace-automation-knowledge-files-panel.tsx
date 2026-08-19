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
import { useRef } from "react";
import { Delete02Icon, File01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createApiClient } from "@/lib/api-client";
import { isApiResponseErrorCode, readApiResponseError } from "@/lib/api-error";
import {
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES,
  WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES,
  type WorkspaceAutomationKnowledgeFileSummary,
} from "@/lib/agents/workspace-automation-knowledge-files";
import { WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS } from "@/lib/agents/workspace-automation-knowledge-text";

import { workspaceAutomationFormMessages } from "./workspace-automation-form.messages";

const api = createApiClient();
const KNOWLEDGE_FILE_ACCEPT = WORKSPACE_AUTOMATION_KNOWLEDGE_ACCEPT_EXTENSIONS.join(",");

function knowledgeFilesQueryKey(organizationSlug: string, automationId: string) {
  return ["workspace-automation-knowledge-files", organizationSlug, automationId] as const;
}

function formatByteSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceAutomationKnowledgeFilesPanel({
  automationId,
  disabled,
  organizationSlug,
}: {
  automationId?: string;
  disabled?: boolean;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const filesQuery = useQuery({
    queryKey: automationId ? knowledgeFilesQueryKey(organizationSlug, automationId) : ["none"],
    enabled: Boolean(automationId),
    queryFn: async () => {
      if (!automationId) {
        return [] as WorkspaceAutomationKnowledgeFileSummary[];
      }
      const response = await api.api.orgs[":organizationSlug"].automations[":automationId"][
        "knowledge-files"
      ].$get({
        param: { organizationSlug, automationId },
      });
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to load knowledge files");
      }
      const body = (await response.json()) as {
        knowledgeFiles: WorkspaceAutomationKnowledgeFileSummary[];
      };
      return body.knowledgeFiles;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!automationId) {
        throw new Error("missing_automation");
      }
      if (file.size > WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_BYTES) {
        throw new Error("knowledge_file_too_large");
      }

      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(
        `/api/orgs/${encodeURIComponent(organizationSlug)}/automations/${encodeURIComponent(automationId)}/knowledge-files`,
        {
          method: "POST",
          body: formData,
        },
      );
      if (!response.ok) {
        throw await readApiResponseError(response, "Failed to upload knowledge file");
      }
      return response.json() as Promise<{
        knowledgeFile: WorkspaceAutomationKnowledgeFileSummary;
      }>;
    },
    onSuccess: () => {
      if (!automationId) {
        return;
      }
      toast.success(intl.formatMessage(workspaceAutomationFormMessages.knowledgeFileUploaded));
      void queryClient.invalidateQueries({
        queryKey: knowledgeFilesQueryKey(organizationSlug, automationId),
      });
    },
    onError: (error) => {
      toast.error(
        intl.formatMessage(
          isApiResponseErrorCode(error, "knowledge_file_too_large") ||
            (error instanceof Error && error.message === "knowledge_file_too_large")
            ? workspaceAutomationFormMessages.knowledgeFileTooLarge
            : isApiResponseErrorCode(error, "unsupported_knowledge_file")
              ? workspaceAutomationFormMessages.knowledgeFileUnsupported
              : isApiResponseErrorCode(error, "knowledge_file_limit_reached")
                ? workspaceAutomationFormMessages.knowledgeFileLimitReached
                : workspaceAutomationFormMessages.knowledgeFileUploadError,
        ),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (knowledgeFileId: string) => {
      if (!automationId) {
        throw new Error("missing_automation");
      }
      const response = await api.api.orgs[":organizationSlug"].automations[":automationId"][
        "knowledge-files"
      ][":knowledgeFileId"].$delete({
        param: { organizationSlug, automationId, knowledgeFileId },
      });
      if (!response.ok && response.status !== 204) {
        throw await readApiResponseError(response, "Failed to delete knowledge file");
      }
    },
    onSuccess: () => {
      if (!automationId) {
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: knowledgeFilesQueryKey(organizationSlug, automationId),
      });
    },
    onError: () => {
      toast.error(intl.formatMessage(workspaceAutomationFormMessages.knowledgeFileDeleteError));
    },
  });

  if (!automationId) {
    return (
      <p className="text-xs text-pretty text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.knowledgeFilesSaveFirst} />
      </p>
    );
  }

  const files = filesQuery.data ?? [];
  const atLimit = files.length >= WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={KNOWLEDGE_FILE_ACCEPT}
        className="sr-only"
        disabled={disabled || uploadMutation.isPending || atLimit}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            uploadMutation.mutate(file);
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <FormattedMessage
            {...workspaceAutomationFormMessages.knowledgeFilesCount}
            values={{ count: files.length, max: WORKSPACE_AUTOMATION_KNOWLEDGE_MAX_FILES }}
          />
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 rounded-full px-3"
          disabled={disabled || uploadMutation.isPending || atLimit}
          onClick={() => inputRef.current?.click()}
        >
          <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-3.5" />
          <FormattedMessage {...workspaceAutomationFormMessages.uploadKnowledgeFile} />
        </Button>
      </div>
      {filesQuery.isError ? (
        <p className="text-xs text-destructive">
          <FormattedMessage {...workspaceAutomationFormMessages.knowledgeFilesLoadError} />
        </p>
      ) : null}
      {files.length === 0 && !filesQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage {...workspaceAutomationFormMessages.knowledgeFilesEmpty} />
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <HugeiconsIcon
                icon={File01Icon}
                strokeWidth={1.8}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{file.filename}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatByteSize(file.byteSize)}
                  {file.extractedCharacterCount > 0
                    ? ` · ${intl.formatMessage(workspaceAutomationFormMessages.knowledgeFileExtracted, { count: file.extractedCharacterCount })}`
                    : ` · ${intl.formatMessage(workspaceAutomationFormMessages.knowledgeFileNoText)}`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                disabled={disabled || deleteMutation.isPending}
                aria-label={intl.formatMessage(workspaceAutomationFormMessages.removeKnowledgeFile, {
                  filename: file.filename,
                })}
                onClick={() => deleteMutation.mutate(file.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

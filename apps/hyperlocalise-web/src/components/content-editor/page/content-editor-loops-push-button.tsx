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
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { IntegrationLogo } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/integration-logo";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { queueLoopsPushRun } from "@/lib/loops/queue-loops-push-run";
import { buildAutomationsDetailHref } from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { isLoopsSourcePath } from "@/lib/loops/source-path";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import {
  contentEditorLoopsIngestQueryKey,
  contentEditorLoopsPushQueryKey,
  fetchContentEditorLoopsIngestCandidates,
  fetchContentEditorLoopsPushCandidates,
  invalidateContentEditorLoopsPushQueries,
} from "./content-editor-loops-push-queries";
import {
  contentEditorPushDialogCandidates,
  contentEditorToolbarShowsIntegration,
} from "./content-editor-integration-toolbar-visibility";

export function ContentEditorLoopsPushButton({
  organizationSlug,
  projectId,
  canManageAutomations,
  sourcePath = null,
  pageNavigationGuardRef,
}: {
  organizationSlug: string;
  projectId: string;
  canManageAutomations: boolean;
  sourcePath?: string | null;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const openSourcePath = isContentEditorAllFilesSourcePath(sourcePath) ? null : sourcePath;
  const pathQueryEnabled =
    canManageAutomations && Boolean(openSourcePath && isLoopsSourcePath(openSourcePath));

  const ingestCandidatesQuery = useQuery({
    queryKey: contentEditorLoopsIngestQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorLoopsIngestCandidates({
        organizationSlug,
        projectId,
        sourcePath: openSourcePath,
      }),
    enabled: pathQueryEnabled,
  });

  const pushCandidatesQuery = useQuery({
    queryKey: contentEditorLoopsPushQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorLoopsPushCandidates({
        organizationSlug,
        projectId,
        sourcePath: openSourcePath,
      }),
    enabled: pathQueryEnabled,
  });

  const pushMutation = useMutation({
    mutationFn: queueLoopsPushRun,
    onSuccess: (_data, variables) => {
      toast.success("Push to Loops queued.");
      setDialogOpen(false);
      setSelectedAutomationId(null);
      invalidateContentEditorLoopsPushQueries(queryClient, organizationSlug, projectId);
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, variables.automationId],
      });
      attemptCatPageNavigation(pageNavigationGuardRef, () => {
        router.push(
          buildAutomationsDetailHref(organizationSlug, {
            automationId: variables.automationId,
            projectId,
            tab: "history",
          }),
        );
      });
    },
    onError: () => {
      toast.error("Failed to queue Push to Loops.");
    },
  });

  if (!canManageAutomations) {
    return null;
  }

  if (!contentEditorToolbarShowsIntegration(ingestCandidatesQuery.data)) {
    return null;
  }

  const dialogCandidates = contentEditorPushDialogCandidates({
    ingestCandidates: ingestCandidatesQuery.data,
    pushCandidates: pushCandidatesQuery.data,
    pushQueryFailed: pushCandidatesQuery.isError,
  });

  const isPending = pushMutation.isPending;
  const isDisabled = isPending || pushCandidatesQuery.isLoading || dialogCandidates.length === 0;
  const pushIcon = isPending ? (
    <Spinner data-icon="inline-start" />
  ) : (
    <IntegrationLogo src="/images/loops-logo.svg" className="size-4" />
  );
  const candidates = pushCandidatesQuery.data ?? [];
  const effectiveAutomationId = selectedAutomationId ?? candidates[0]?.automationId ?? null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0"
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) {
            setSelectedAutomationId(candidates[0]?.automationId ?? null);
            setDialogOpen(true);
          }
        }}
      >
        {pushIcon}
        {intl.formatMessage({ defaultMessage: "Push to Loops", id: 'XBySEBTpqM' })}
      </Button>
      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-background p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">Push to Loops</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Creates or updates unpublished locale copies named {"{source} [{locale}]"}. The source
              email is never changed.
            </p>
            <label className="mt-3 block text-xs font-medium">
              Automation
              <select
                className="mt-1 w-full rounded-md border p-2 text-sm"
                value={effectiveAutomationId ?? ""}
                onChange={(event) => setSelectedAutomationId(event.target.value || null)}
              >
                {candidates.map((candidate) => (
                  <option key={candidate.automationId} value={candidate.automationId}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!effectiveAutomationId || isPending}
                onClick={() => {
                  if (!effectiveAutomationId || !openSourcePath) {
                    return;
                  }
                  pushMutation.mutate({
                    organizationSlug,
                    automationId: effectiveAutomationId,
                    sourcePaths: [openSourcePath],
                  });
                }}
              >
                {isPending ? "Queuing…" : "Push"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

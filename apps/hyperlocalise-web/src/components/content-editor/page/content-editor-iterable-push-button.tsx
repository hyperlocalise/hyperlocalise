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
import { queueIterablePushRun } from "@/lib/iterable/queue-iterable-push-run";
import { isIterableSourcePath } from "@/lib/iterable/source-path";
import { buildAutomationsDetailHref } from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorIterablePushDialog } from "./content-editor-iterable-push-dialog";
import { contentEditorIterablePushButtonMessages as messages } from "./content-editor-iterable-push-button.messages";
import {
  contentEditorPushDialogCandidates,
  contentEditorToolbarShowsIntegration,
} from "./content-editor-integration-toolbar-visibility";
import {
  contentEditorIterableIngestQueryKey,
  contentEditorIterablePushQueryKey,
  fetchContentEditorIterableIngestCandidates,
  fetchContentEditorIterablePushCandidates,
  invalidateContentEditorIterablePushQueries,
} from "./content-editor-iterable-push-queries";

export function ContentEditorIterablePushButton({
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
  const openSourcePath = isContentEditorAllFilesSourcePath(sourcePath) ? null : sourcePath;
  const pathQueryEnabled =
    canManageAutomations && Boolean(openSourcePath && isIterableSourcePath(openSourcePath));

  const ingestCandidatesQuery = useQuery({
    queryKey: contentEditorIterableIngestQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorIterableIngestCandidates({
        organizationSlug,
        projectId,
        sourcePath: openSourcePath,
      }),
    enabled: pathQueryEnabled,
  });

  const pushCandidatesQuery = useQuery({
    queryKey: contentEditorIterablePushQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorIterablePushCandidates({
        organizationSlug,
        projectId,
        sourcePath: openSourcePath,
      }),
    enabled: pathQueryEnabled,
  });

  const navigateToPushRunHistory = (automationId: string) => {
    const href = buildAutomationsDetailHref(organizationSlug, {
      automationId,
      projectId,
      tab: "history",
    });
    attemptCatPageNavigation(pageNavigationGuardRef, () => {
      router.push(href);
    });
  };

  const pushMutation = useMutation({
    mutationFn: queueIterablePushRun,
    onSuccess: (_data, variables) => {
      toast.success(intl.formatMessage(messages.pushQueued));
      setDialogOpen(false);
      invalidateContentEditorIterablePushQueries(queryClient, organizationSlug, projectId);
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, variables.automationId],
      });
      navigateToPushRunHistory(variables.automationId);
    },
    onError: () => {
      toast.error(intl.formatMessage(messages.pushFailed));
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

  const pushLabel = intl.formatMessage(messages.pushButton);
  const isPending = pushMutation.isPending;
  const isDisabled = isPending || pushCandidatesQuery.isLoading || dialogCandidates.length === 0;
  const pushIcon = isPending ? (
    <Spinner data-icon="inline-start" />
  ) : (
    <IntegrationLogo src="/images/iterable-logo.png" className="size-4" />
  );

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0"
        disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) {
            setDialogOpen(true);
          }
        }}
      >
        {pushIcon}
        {pushLabel}
      </Button>
      <ContentEditorIterablePushDialog
        open={dialogOpen}
        organizationSlug={organizationSlug}
        sourcePath={openSourcePath}
        candidates={dialogCandidates}
        pending={isPending}
        onOpenChange={setDialogOpen}
        onConfirm={(input) =>
          pushMutation.mutate({
            organizationSlug,
            automationId: input.automationId,
            sourcePaths: input.sourcePaths,
          })
        }
      />
    </>
  );
}

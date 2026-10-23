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
import { siGoogledrive } from "simple-icons";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { queueGoogleDrivePushRun } from "@/lib/google-drive/queue-google-drive-push-run";
import { buildAutomationsDetailHref } from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { isGoogleDriveSourcePath } from "@/lib/google-drive/constants";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorGoogleDrivePushDialog } from "./content-editor-google-drive-push-dialog";
import { contentEditorGoogleDrivePushButtonMessages as messages } from "./content-editor-google-drive-push-button.messages";
import {
  contentEditorToolbarShowsIntegration,
  selectActionablePushCandidates,
} from "./content-editor-integration-toolbar-visibility";
import {
  contentEditorGoogleDriveIngestQueryKey,
  contentEditorGoogleDrivePushQueryKey,
  fetchContentEditorGoogleDriveIngestCandidates,
  fetchContentEditorGoogleDrivePushCandidates,
  invalidateContentEditorGoogleDrivePushQueries,
} from "./content-editor-google-drive-push-queries";

export function ContentEditorGoogleDrivePushButton({
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
    canManageAutomations && Boolean(openSourcePath && isGoogleDriveSourcePath(openSourcePath));

  const ingestCandidatesQuery = useQuery({
    queryKey: contentEditorGoogleDriveIngestQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorGoogleDriveIngestCandidates({
        organizationSlug,
        projectId,
        sourcePath: openSourcePath,
      }),
    enabled: pathQueryEnabled,
  });

  const pushCandidatesQuery = useQuery({
    queryKey: contentEditorGoogleDrivePushQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorGoogleDrivePushCandidates({
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
    mutationFn: queueGoogleDrivePushRun,
    onSuccess: (_data, variables) => {
      toast.success(intl.formatMessage(messages.pushQueued));
      setDialogOpen(false);
      invalidateContentEditorGoogleDrivePushQueries(queryClient, organizationSlug, projectId);
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

  const actionableCandidates = selectActionablePushCandidates(pushCandidatesQuery.data ?? []);

  const pushLabel = intl.formatMessage(messages.pushButton);
  const isPending = pushMutation.isPending;
  const isDisabled =
    isPending || pushCandidatesQuery.isPending || actionableCandidates.length === 0;
  const pushIcon = isPending ? (
    <Spinner data-icon="inline-start" />
  ) : (
    <SimpleBrandIcon
      icon={siGoogledrive}
      colored={false}
      className="size-4"
      data-icon="inline-start"
      opacity={1}
    />
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
      <ContentEditorGoogleDrivePushDialog
        open={dialogOpen}
        organizationSlug={organizationSlug}
        sourcePath={openSourcePath}
        candidates={actionableCandidates}
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

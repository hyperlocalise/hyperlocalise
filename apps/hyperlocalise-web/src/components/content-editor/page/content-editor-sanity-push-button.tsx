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
import { siSanity } from "simple-icons";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { queueSanityPushRun } from "@/lib/sanity/queue-sanity-push-run";
import { buildAutomationsDetailHref } from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";
import { isSanityCatSourcePath } from "@/lib/sanity/segment-file";

import { ContentEditorSanityPushDialog } from "./content-editor-sanity-push-dialog";
import { contentEditorSanityPushButtonMessages as messages } from "./content-editor-sanity-push-button.messages";
import {
  contentEditorSanityPushQueryKey,
  fetchContentEditorSanityPushCandidates,
  invalidateContentEditorSanityPushQueries,
} from "./content-editor-sanity-push-queries";

export function ContentEditorSanityPushButton({
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

  const candidatesQuery = useQuery({
    queryKey: contentEditorSanityPushQueryKey(organizationSlug, projectId, openSourcePath),
    queryFn: () =>
      fetchContentEditorSanityPushCandidates({
        organizationSlug,
        projectId,
        sourcePath: openSourcePath,
      }),
    enabled:
      canManageAutomations && Boolean(openSourcePath && isSanityCatSourcePath(openSourcePath)),
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
    mutationFn: queueSanityPushRun,
    onSuccess: (_data, variables) => {
      toast.success(intl.formatMessage(messages.pushQueued));
      setDialogOpen(false);
      invalidateContentEditorSanityPushQueries(queryClient, organizationSlug, projectId);
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

  const candidates = (candidatesQuery.data ?? []).filter(
    (candidate) => !candidate.pushRunInProgress,
  );

  if (candidates.length === 0) {
    return null;
  }

  const pushLabel = intl.formatMessage(messages.pushButton);
  const isPending = pushMutation.isPending;
  const pushIcon = isPending ? (
    <Spinner data-icon="inline-start" />
  ) : (
    <SimpleBrandIcon
      icon={siSanity}
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
        disabled={isPending}
        onClick={() => setDialogOpen(true)}
      >
        {pushIcon}
        {pushLabel}
      </Button>
      <ContentEditorSanityPushDialog
        open={dialogOpen}
        organizationSlug={organizationSlug}
        sourcePath={openSourcePath}
        candidates={candidates}
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

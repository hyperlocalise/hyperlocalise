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
import { CaretDownIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { siIntercom } from "simple-icons";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { queueIntercomPushRun } from "@/lib/intercom/queue-intercom-push-run";
import { buildAutomationsDetailHref } from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { contentEditorIntercomPushButtonMessages as messages } from "./content-editor-intercom-push-button.messages";
import {
  contentEditorIntercomPushQueryKey,
  fetchContentEditorIntercomPushCandidates,
  invalidateContentEditorIntercomPushQueries,
  type ContentEditorIntercomPushCandidate,
} from "./content-editor-intercom-push-queries";

export function ContentEditorIntercomPushButton({
  organizationSlug,
  projectId,
  canManageAutomations,
  pageNavigationGuardRef,
}: {
  organizationSlug: string;
  projectId: string;
  canManageAutomations: boolean;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();

  const candidatesQuery = useQuery({
    queryKey: contentEditorIntercomPushQueryKey(organizationSlug, projectId),
    queryFn: () =>
      fetchContentEditorIntercomPushCandidates({
        organizationSlug,
        projectId,
      }),
    enabled: canManageAutomations,
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
    mutationFn: queueIntercomPushRun,
    onSuccess: (_data, variables) => {
      toast.success(intl.formatMessage(messages.pushQueued));
      invalidateContentEditorIntercomPushQueries(queryClient, organizationSlug, projectId);
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
      icon={siIntercom}
      colored={false}
      className="size-4"
      data-icon="inline-start"
      opacity={1}
    />
  );

  if (candidates.length === 1) {
    const candidate = candidates[0]!;
    return (
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0"
        disabled={isPending}
        onClick={() =>
          pushMutation.mutate({
            organizationSlug,
            automationId: candidate.automationId,
          })
        }
      >
        {pushIcon}
        {pushLabel}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" className="h-8 shrink-0" disabled={isPending} />
        }
      >
        {pushIcon}
        {pushLabel}
        <CaretDownIcon data-icon="inline-end" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {candidates.map((candidate) => (
          <IntercomPushMenuItem
            key={candidate.automationId}
            candidate={candidate}
            disabled={isPending}
            onSelect={() =>
              pushMutation.mutate({
                organizationSlug,
                automationId: candidate.automationId,
              })
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function IntercomPushMenuItem({
  candidate,
  disabled,
  onSelect,
}: {
  candidate: ContentEditorIntercomPushCandidate;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem disabled={disabled} onClick={onSelect}>
      <span className="min-w-0 truncate">{candidate.name}</span>
      <span className="ms-auto ps-2 text-xs tabular-nums text-muted-foreground">
        {candidate.eligibleLocaleCount}
      </span>
    </DropdownMenuItem>
  );
}

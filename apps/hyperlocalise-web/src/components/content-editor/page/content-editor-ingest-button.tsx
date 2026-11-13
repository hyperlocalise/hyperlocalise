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
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

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
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { queueAutomationIngestRun } from "@/lib/agents/queue-automation-ingest-run";
import { buildAutomationsDetailHref } from "@/lib/navigation/workspace-automation-editor-tab";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { contentEditorIngestButtonMessages as messages } from "./content-editor-ingest-button.messages";

export type ContentEditorIngestCandidate = {
  automationId: string;
  name: string;
  runInProgress: boolean;
};

export function ContentEditorIngestButton({
  organizationSlug,
  projectId,
  canManageAutomations,
  queryKey,
  fetchCandidates,
  invalidateKeys,
  icon,
  pageNavigationGuardRef,
}: {
  organizationSlug: string;
  projectId: string;
  canManageAutomations: boolean;
  queryKey: readonly unknown[];
  fetchCandidates: () => Promise<ContentEditorIngestCandidate[]>;
  invalidateKeys: readonly (readonly unknown[])[];
  icon: ReactNode;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const candidatesQuery = useQuery({
    queryKey,
    queryFn: fetchCandidates,
    enabled: canManageAutomations,
  });

  const navigateToRunHistory = (automationId: string) => {
    const href = buildAutomationsDetailHref(organizationSlug, {
      automationId,
      projectId,
      tab: "history",
    });
    attemptCatPageNavigation(pageNavigationGuardRef, () => {
      router.push(href);
    });
  };

  const ingestMutation = useMutation({
    mutationFn: (automationId: string) =>
      queueAutomationIngestRun({ organizationSlug, automationId }),
    onSuccess: (_data, automationId) => {
      toast.success(intl.formatMessage(messages.ingestQueued));
      setDialogOpen(false);
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({
        queryKey: ["workspace-automation", organizationSlug, automationId],
      });
      navigateToRunHistory(automationId);
    },
    onError: () => {
      toast.error(intl.formatMessage(messages.ingestFailed));
    },
  });

  if (!canManageAutomations) {
    return null;
  }

  const candidates = candidatesQuery.data ?? [];
  if (candidates.length === 0) {
    return null;
  }

  const idleCandidates = candidates.filter((candidate) => !candidate.runInProgress);
  const isPending = ingestMutation.isPending;
  const ingestLabel = intl.formatMessage(messages.ingestButton);

  const queueOrPick = () => {
    if (idleCandidates.length === 1) {
      ingestMutation.mutate(idleCandidates[0].automationId);
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        disabled={isPending || idleCandidates.length === 0}
        onClick={queueOrPick}
      >
        {isPending ? <Spinner data-icon="inline-start" /> : icon}
        {ingestLabel}
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(messages.chooseAutomationTitle)}</DialogTitle>
            <DialogDescription>
              {intl.formatMessage(messages.chooseAutomationDescription)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {idleCandidates.map((candidate) => (
              <Button
                key={candidate.automationId}
                type="button"
                variant="outline"
                className="justify-start"
                disabled={isPending}
                onClick={() => ingestMutation.mutate(candidate.automationId)}
              >
                {candidate.name}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {intl.formatMessage(messages.cancel)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

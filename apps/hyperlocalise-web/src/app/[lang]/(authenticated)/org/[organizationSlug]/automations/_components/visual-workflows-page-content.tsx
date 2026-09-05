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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { useState } from "react";
import { Delete02Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgRouter } from "@/lib/navigation/use-org-router";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  PageHeader,
  WorkspacePageShell,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_components/workspace-resource-shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

import { VisualWorkflowDeleteDialog } from "./visual-workflow-delete-dialog";
import { createVisualWorkflowsApi } from "./visual-workflows-api";
import { visualWorkflowsPageMessages } from "./visual-workflows-page.messages";

const visualWorkflowsApi = createVisualWorkflowsApi();

function visualWorkflowsQueryKey(organizationSlug: string) {
  return ["visual-workflows", organizationSlug] as const;
}

export function VisualWorkflowsPageContent({
  organizationSlug,
  visualWorkflowsApi: injectedApi = visualWorkflowsApi,
}: {
  organizationSlug: string;
  visualWorkflowsApi?: typeof visualWorkflowsApi;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const [workflowToDelete, setWorkflowToDelete] = useState<VisualWorkflowRecord | null>(null);
  const workflowsQuery = useQuery({
    queryKey: visualWorkflowsQueryKey(organizationSlug),
    queryFn: () => injectedApi.listVisualWorkflows(organizationSlug),
  });

  const createMutation = useMutation({
    mutationFn: () => injectedApi.createVisualWorkflow(organizationSlug),
    onSuccess: (workflow) => {
      void queryClient.invalidateQueries({ queryKey: visualWorkflowsQueryKey(organizationSlug) });
      router.push(`/org/${organizationSlug}/automations/visual-workflows/${workflow.id}`);
    },
    onError: () => {
      toast.error(<FormattedMessage {...visualWorkflowsPageMessages.createFailed} />);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (workflowId: string) =>
      injectedApi.deleteVisualWorkflow(organizationSlug, workflowId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: visualWorkflowsQueryKey(organizationSlug) });
      setWorkflowToDelete(null);
      toast.success(<FormattedMessage {...visualWorkflowsPageMessages.deleteSuccess} />);
    },
    onError: () => {
      toast.error(<FormattedMessage {...visualWorkflowsPageMessages.deleteFailed} />);
    },
  });

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={GitBranchIcon}
        label={intl.formatMessage(visualWorkflowsPageMessages.pageLabel)}
        title={intl.formatMessage(visualWorkflowsPageMessages.pageTitle)}
        description={intl.formatMessage(visualWorkflowsPageMessages.pageDescription)}
        actions={
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <FormattedMessage {...visualWorkflowsPageMessages.newWorkflow} />
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card">
        {workflowsQuery.isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-full rounded-md bg-muted" />
            <Skeleton className="h-10 w-full rounded-md bg-muted" />
          </div>
        ) : workflowsQuery.data && workflowsQuery.data.length > 0 ? (
          <ul className="divide-y divide-border">
            {workflowsQuery.data.map((workflow) => (
              <li key={workflow.id} className="flex items-center gap-2 px-2">
                <OrgNavLink
                  href={`/org/${organizationSlug}/automations/visual-workflows/${workflow.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-4 px-2 py-3 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{workflow.name}</p>
                    <p className="text-sm text-muted-foreground">{workflow.status}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    v{workflow.definitionVersion}
                  </span>
                </OrgNavLink>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={intl.formatMessage(visualWorkflowsPageMessages.deleteWorkflow)}
                  disabled={deleteMutation.isPending}
                  onClick={() => setWorkflowToDelete(workflow)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center">
            <TypographyP tone="subtle">
              <FormattedMessage {...visualWorkflowsPageMessages.emptyState} />
            </TypographyP>
          </div>
        )}
      </div>
      <VisualWorkflowDeleteDialog
        open={workflowToDelete !== null}
        workflowName={workflowToDelete?.name ?? ""}
        isDeleting={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setWorkflowToDelete(null);
          }
        }}
        onConfirm={() => {
          if (!workflowToDelete) {
            return;
          }
          deleteMutation.mutate(workflowToDelete.id);
        }}
      />
    </WorkspacePageShell>
  );
}

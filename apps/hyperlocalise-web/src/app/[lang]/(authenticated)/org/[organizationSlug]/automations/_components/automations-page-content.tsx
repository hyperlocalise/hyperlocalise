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
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";

import { createAutomationsApi } from "./automations-api";
import type { AutomationListFilters } from "./automations-page-view-model";
import { AUTOMATIONS_ACTION_LINK_BUTTON_PROPS, AutomationsPageView } from "./automations-page-view";
import { githubAutoReviewCardMessages } from "./github-auto-review-card.messages";
import { useAutomationAssistantStart } from "./use-automation-assistant-start";
import { createVisualWorkflowsApi } from "./visual-workflows-api";

const automationsApi = createAutomationsApi(apiClient);
const visualWorkflowsApi = createVisualWorkflowsApi();

function automationsQueryKey(organizationSlug: string, projectId?: string) {
  return ["workspace-automations", organizationSlug, projectId ?? "all"] as const;
}

function githubAutoReviewQueryKey(organizationSlug: string) {
  return ["github-auto-review", organizationSlug] as const;
}

function renderProductionAutomationLink({
  href,
  children,
  className,
}: Parameters<NonNullable<Parameters<typeof AutomationsPageView>[0]["renderAutomationLink"]>>[0]) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function renderProductionActionLink({
  href,
  children,
  kind = "header",
}: Parameters<NonNullable<Parameters<typeof AutomationsPageView>[0]["renderActionLink"]>>[0]) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      {...AUTOMATIONS_ACTION_LINK_BUTTON_PROPS[kind]}
    >
      {children}
    </Button>
  );
}

export function AutomationsPageContent({
  organizationSlug,
  projectId,
  assistantEnabled = false,
  canOpenVisualWorkflows = false,
  initialTypeFilter,
  automationsApi: injectedAutomationsApi = automationsApi,
  visualWorkflowsApi: injectedVisualWorkflowsApi = visualWorkflowsApi,
}: {
  organizationSlug: string;
  projectId?: string;
  assistantEnabled?: boolean;
  canOpenVisualWorkflows?: boolean;
  initialTypeFilter?: AutomationListFilters["type"];
  automationsApi?: typeof automationsApi;
  visualWorkflowsApi?: Pick<typeof visualWorkflowsApi, "listVisualWorkflows">;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const assistant = useAutomationAssistantStart({
    organizationSlug,
    projectId,
    enabled: assistantEnabled,
  });
  // Workflows belong to the workspace, so a project's list is agents alone.
  const workflowsListed = canOpenVisualWorkflows && !projectId;

  const automationsQuery = useQuery({
    queryKey: automationsQueryKey(organizationSlug, projectId),
    queryFn: () => injectedAutomationsApi.listAutomations(organizationSlug, { projectId }),
  });
  const visualWorkflowsQuery = useQuery({
    // The same key the workflow editor refreshes after a save or a delete.
    queryKey: ["visual-workflows", organizationSlug],
    enabled: workflowsListed,
    queryFn: () => injectedVisualWorkflowsApi.listVisualWorkflows(organizationSlug),
  });
  const autoReviewQuery = useQuery({
    queryKey: githubAutoReviewQueryKey(organizationSlug),
    enabled: !projectId,
    queryFn: () => injectedAutomationsApi.getGithubAutoReviewSettings(organizationSlug),
  });
  const saveAutoReview = useMutation({
    mutationFn: (
      input: Parameters<typeof injectedAutomationsApi.updateGithubAutoReviewSettings>[1],
    ) => injectedAutomationsApi.updateGithubAutoReviewSettings(organizationSlug, input),
    onSuccess: (autoReview) => {
      queryClient.setQueryData(githubAutoReviewQueryKey(organizationSlug), autoReview);
      toast.success(intl.formatMessage(githubAutoReviewCardMessages.saveSuccess));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(githubAutoReviewCardMessages.saveError),
      );
    },
  });

  return (
    <AutomationsPageView
      organizationSlug={organizationSlug}
      projectId={projectId}
      automations={automationsQuery.data ?? []}
      visualWorkflows={visualWorkflowsQuery.data ?? []}
      workflowsAvailable={workflowsListed}
      initialTypeFilter={initialTypeFilter}
      assistant={assistant}
      isLoading={automationsQuery.isLoading || (workflowsListed && visualWorkflowsQuery.isLoading)}
      error={automationsQuery.error ?? visualWorkflowsQuery.error}
      autoReview={autoReviewQuery.data}
      autoReviewLoading={autoReviewQuery.isLoading}
      autoReviewError={autoReviewQuery.error}
      autoReviewSaving={saveAutoReview.isPending}
      onSaveAutoReview={async (input) => {
        await saveAutoReview.mutateAsync(input);
      }}
      renderAutomationLink={renderProductionAutomationLink}
      renderActionLink={renderProductionActionLink}
    />
  );
}

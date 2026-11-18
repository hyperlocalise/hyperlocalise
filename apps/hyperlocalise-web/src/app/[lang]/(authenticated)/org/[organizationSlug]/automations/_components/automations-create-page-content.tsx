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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import type { WorkspaceAutomationTemplate } from "@/lib/agents/workspace-automation-templates";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import type { AutomationsLinkRenderer } from "./automation-template-card";
import {
  AutomationsCreatePageView,
  type AutomationWorkflowAccess,
} from "./automations-create-page-view";
import { automationsCreatePageViewMessages } from "./automations-create-page-view.messages";
import { useAutomationAssistantStart } from "./use-automation-assistant-start";
import { createVisualWorkflowsApi } from "./visual-workflows-api";

const visualWorkflowsApi = createVisualWorkflowsApi();

function renderProductionAutomationLink({
  href,
  children,
  className,
}: Parameters<AutomationsLinkRenderer>[0]) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function AutomationsCreatePageContent({
  organizationSlug,
  projectId,
  templates,
  assistantEnabled = false,
  workflowAccess,
  visualWorkflowsApi: injectedVisualWorkflowsApi = visualWorkflowsApi,
}: {
  organizationSlug: string;
  projectId?: string;
  templates: WorkspaceAutomationTemplate[];
  assistantEnabled?: boolean;
  workflowAccess: AutomationWorkflowAccess;
  visualWorkflowsApi?: Pick<typeof visualWorkflowsApi, "createVisualWorkflow">;
}) {
  const intl = useIntl();
  const router = useOrgRouter();
  const queryClient = useQueryClient();
  const assistant = useAutomationAssistantStart({
    organizationSlug,
    projectId,
    enabled: assistantEnabled,
  });

  const createWorkflow = useMutation({
    mutationFn: () => injectedVisualWorkflowsApi.createVisualWorkflow(organizationSlug),
    onSuccess: (workflow) => {
      void queryClient.invalidateQueries({ queryKey: ["visual-workflows", organizationSlug] });
      router.push(`${buildAutomationsPath(organizationSlug)}/visual-workflows/${workflow.id}`);
    },
    onError: () => {
      toast.error(intl.formatMessage(automationsCreatePageViewMessages.workflowCreateFailed));
    },
  });

  return (
    <AutomationsCreatePageView
      organizationSlug={organizationSlug}
      projectId={projectId}
      templates={templates}
      assistant={assistant}
      workflowAccess={workflowAccess}
      // Stays busy after success too, while the canvas opens.
      creatingWorkflow={createWorkflow.isPending || createWorkflow.isSuccess}
      onCreateWorkflow={() => createWorkflow.mutate()}
      renderAutomationLink={renderProductionAutomationLink}
    />
  );
}

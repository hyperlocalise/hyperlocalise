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
import { isWorkspaceOperatorRole } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { canUseWorkspaceAutomationAssistant } from "@/lib/agents/workspace-automation-assistant-access";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import {
  getAutumnWorkspaceBooleanFeatureEnabled,
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsCreatePageContent } from "../_components/automations-create-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "automationNew");
}

export default function CreateAutomationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return <CreateAutomationPageLoader params={params} />;
}

async function CreateAutomationPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const [automationsEnabled, visualWorkflowsEnabled, assistantEnabled] = await Promise.all([
    getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth),
    getAutumnWorkspaceBooleanFeatureEnabled(autumnFeatureIds.automationWorkflow, auth),
    canUseWorkspaceAutomationAssistant(auth),
  ]);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="workspace" />;
  }

  // Someone who cannot create workflows is told who can, whatever the plan.
  const workflowAccess = !isWorkspaceOperatorRole(auth.membership.role)
    ? "restricted"
    : visualWorkflowsEnabled
      ? "available"
      : "upgrade";

  return (
    <AutomationsCreatePageContent
      organizationSlug={organizationSlug}
      templates={getMergedWorkspaceAutomationTemplates()}
      assistantEnabled={assistantEnabled}
      workflowAccess={workflowAccess}
    />
  );
}

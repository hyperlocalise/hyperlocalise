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
import { canUseWorkspaceAutomationAssistant } from "@/lib/agents/workspace-automation-assistant-access";
import { isWorkspaceOperatorRole } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import {
  getAutumnWorkspaceBooleanFeatureEnabled,
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { AutomationsPageContent } from "./_components/automations-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "automations");
}

export default function AutomationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  return <AutomationsPageLoader params={params} searchParams={searchParams} />;
}

async function AutomationsPageLoader({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { organizationSlug } = await params;
  const { type } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  const [automationsEnabled, visualWorkflowsEnabled] = await Promise.all([
    getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth),
    getAutumnWorkspaceBooleanFeatureEnabled(autumnFeatureIds.automationWorkflow, auth),
  ]);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="workspace" />;
  }

  const assistantEnabled = await canUseWorkspaceAutomationAssistant(auth);

  return (
    <AutomationsPageContent
      organizationSlug={organizationSlug}
      assistantEnabled={assistantEnabled}
      canOpenVisualWorkflows={
        visualWorkflowsEnabled && isWorkspaceOperatorRole(auth.membership.role)
      }
      initialTypeFilter={type === "agent" || type === "workflow" ? type : "all"}
    />
  );
}

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
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
  workspaceVisualWorkflowsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { OrgPageSuspense } from "../_components/org-page-suspense";
import { AutomationsPageContent } from "./_components/automations-page-content";

export default function AutomationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <AutomationsPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function AutomationsPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const [automationsEnabled, visualWorkflowsEnabled] = await Promise.all([
    getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth),
    getWorkspaceFeatureFlagEnabled(workspaceVisualWorkflowsFlag, auth),
  ]);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="workspace" />;
  }

  const templates = getMergedWorkspaceAutomationTemplates();

  return (
    <AutomationsPageContent
      organizationSlug={organizationSlug}
      templates={templates}
      visualWorkflowsEnabled={visualWorkflowsEnabled}
    />
  );
}

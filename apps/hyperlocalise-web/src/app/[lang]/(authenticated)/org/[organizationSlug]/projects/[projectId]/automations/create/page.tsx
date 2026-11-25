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
import { canUseWorkspaceAutomationAssistant } from "@/lib/agents/workspace-automation-assistant-access";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { getAutumnWorkspaceBooleanFeatureEnabled } from "@/lib/flags/workspace-flags";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsCreatePageContent } from "../../../../automations/_components/automations-create-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "projectAutomationNew");
}

export default function ProjectCreateAutomationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return <ProjectCreateAutomationPageLoader params={params} />;
}

async function ProjectCreateAutomationPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const [automationsEnabled, assistantEnabled] = await Promise.all([
    getAutumnWorkspaceBooleanFeatureEnabled(autumnFeatureIds.automations, auth),
    canUseWorkspaceAutomationAssistant(auth),
  ]);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="project" />;
  }

  // Workflows belong to the workspace, so a project starts agents alone.
  return (
    <AutomationsCreatePageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      templates={getMergedWorkspaceAutomationTemplates()}
      assistantEnabled={assistantEnabled}
      workflowAccess="hidden"
    />
  );
}

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
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsPageContent } from "../../../automations/_components/automations-page-content";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";

export default function ProjectAutomationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectAutomationsPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function ProjectAutomationsPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const automationsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="project" />;
  }

  const templates = getMergedWorkspaceAutomationTemplates();

  return (
    <AutomationsPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      templates={templates}
    />
  );
}

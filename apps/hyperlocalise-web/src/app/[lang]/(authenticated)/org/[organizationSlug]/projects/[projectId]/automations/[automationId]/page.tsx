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
import { hasCapability } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import {
  evaluateWorkspaceFeatureFlags,
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationDetailPageContent } from "../../../../automations/_components/automation-detail-page-content";
import { OrgPageSuspense } from "../../../../_components/org-page-suspense";

export default function ProjectAutomationDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; automationId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectAutomationDetailPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function ProjectAutomationDetailPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; automationId: string }>;
}) {
  const { organizationSlug, projectId, automationId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const automationsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="project" />;
  }

  const flags = await evaluateWorkspaceFeatureFlags(auth);

  return (
    <AutomationDetailPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      automationId={automationId}
      knowledgeAvailable={flags.knowledge}
      canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}

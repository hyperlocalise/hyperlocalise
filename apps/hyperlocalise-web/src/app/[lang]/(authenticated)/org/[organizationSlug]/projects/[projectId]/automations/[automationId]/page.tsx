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
import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import {
  evaluateWorkspaceFeatureFlags,
  requireWorkspaceFeatureFlag,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationDetailPageContent } from "../../../../automations/_components/automation-detail-page-content";

export default async function ProjectAutomationDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; automationId: string }>;
}) {
  const { organizationSlug, projectId, automationId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceAutomationsFlag, auth);
  const flags = await evaluateWorkspaceFeatureFlags(auth);

  return (
    <Suspense fallback={null}>
      <AutomationDetailPageContent
        organizationSlug={organizationSlug}
        projectId={projectId}
        automationId={automationId}
        knowledgeAvailable={flags.knowledge}
        canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
      />
    </Suspense>
  );
}

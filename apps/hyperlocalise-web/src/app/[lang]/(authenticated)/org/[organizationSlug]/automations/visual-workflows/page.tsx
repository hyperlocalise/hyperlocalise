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
import { notFound } from "next/navigation";

import { isWorkspaceOperatorRole } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
  workspaceVisualWorkflowsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { VisualWorkflowsPageContent } from "../_components/visual-workflows-page-content";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export default function VisualWorkflowsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <VisualWorkflowsPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function VisualWorkflowsPageLoader({
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

  if (!visualWorkflowsEnabled) {
    notFound();
  }

  if (!isWorkspaceOperatorRole(auth.membership.role)) {
    notFound();
  }

  return <VisualWorkflowsPageContent organizationSlug={organizationSlug} />;
}

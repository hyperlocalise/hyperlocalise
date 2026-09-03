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
import { visualWorkflowIdParamSchema } from "@/api/routes/visual-workflow/visual-workflow.schema";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
  workspaceVisualWorkflowsFlag,
} from "@/lib/flags/workspace-flags";
import { getVisualWorkflowById } from "@/lib/visual-workflows/visual-workflows";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { VisualWorkflowEditorPageContent } from "../../_components/visual-workflow-editor-page-content";

export default async function VisualWorkflowEditorPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; visualWorkflowId: string }>;
}) {
  const { organizationSlug, visualWorkflowId } = await params;
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

  if (!visualWorkflowIdParamSchema.safeParse({ visualWorkflowId }).success) {
    notFound();
  }

  const workflow = await getVisualWorkflowById({
    organizationId: auth.activeOrganization.localOrganizationId,
    visualWorkflowId,
  });

  if (!workflow) {
    notFound();
  }

  return (
    <VisualWorkflowEditorPageContent organizationSlug={organizationSlug} workflow={workflow} />
  );
}

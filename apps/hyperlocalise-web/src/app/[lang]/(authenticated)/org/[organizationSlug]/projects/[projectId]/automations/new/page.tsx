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
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
} from "@/lib/agents/workspace-automation-view-model";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import {
  evaluateWorkspaceFeatureFlags,
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsNewPageContent } from "../../../../automations/_components/automations-new-page-content";
import { OrgPageSuspense } from "../../../../_components/org-page-suspense";

export default function ProjectNewAutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectNewAutomationPageLoader params={params} searchParams={searchParams} />
    </OrgPageSuspense>
  );
}

async function ProjectNewAutomationPageLoader({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const { template } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  const automationsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="project" />;
  }

  const flags = await evaluateWorkspaceFeatureFlags(auth);
  const templates = getMergedWorkspaceAutomationTemplates();
  const templateForm = template
    ? createWorkspaceAutomationFormStateFromTemplate(template, templates)
    : null;
  const initialForm = {
    ...(templateForm ?? createDefaultWorkspaceAutomationFormState()),
    projectId,
  };

  return (
    <AutomationsNewPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      initialForm={initialForm}
      knowledgeAvailable={flags.knowledge}
      canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}

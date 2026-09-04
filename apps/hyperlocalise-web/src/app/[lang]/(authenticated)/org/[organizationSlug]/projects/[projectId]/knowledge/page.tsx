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
import { KnowledgePageContent } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-page-content";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceKnowledgeFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";

export default function ProjectKnowledgePage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectKnowledgePageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function ProjectKnowledgePageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const knowledgeEnabled = await getWorkspaceFeatureFlagEnabled(workspaceKnowledgeFlag, auth);

  if (!knowledgeEnabled) {
    return <FeatureTeaserPage feature="guideline" scope="project" />;
  }

  return (
    <KnowledgePageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}

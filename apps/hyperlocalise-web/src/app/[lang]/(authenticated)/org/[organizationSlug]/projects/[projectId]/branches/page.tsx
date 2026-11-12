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
import { isProjectMutationAllowed } from "@/api/auth/capability-guards";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { ProjectBranchesPageContent } from "./_components/project-branches-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "projectBranches");
}

export default function ProjectBranchesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return <ProjectBranchesPageLoader params={params} />;
}

async function ProjectBranchesPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <ProjectBranchesPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      canManage={isProjectMutationAllowed(auth.membership.role)}
    />
  );
}

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
import { requireWorkspaceFeatureFlag, workspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { KnowledgePageContent } from "./_components/knowledge-page-content";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceKnowledgeFlag, auth);

  return (
    <KnowledgePageContent
      organizationSlug={organizationSlug}
      canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
    />
  );
}

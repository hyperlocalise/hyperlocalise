/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Suspense } from "react";

import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import { requireWorkspaceFeatureFlag, workspaceAutomationsFlag } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsPageContent } from "./_components/automations-page-content";

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceAutomationsFlag, auth);
  const templates = getMergedWorkspaceAutomationTemplates();

  return (
    <Suspense fallback={null}>
      <AutomationsPageContent organizationSlug={organizationSlug} templates={templates} />
    </Suspense>
  );
}

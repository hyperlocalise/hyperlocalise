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

import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import {
  getWorkspaceFeatureFlagEnabled,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsPageContent } from "./_components/automations-page-content";

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const automationsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceAutomationsFlag, auth);

  if (!automationsEnabled) {
    return <FeatureTeaserPage feature="automations" scope="workspace" />;
  }

  const templates = getMergedWorkspaceAutomationTemplates();

  return (
    <Suspense fallback={null}>
      <AutomationsPageContent organizationSlug={organizationSlug} templates={templates} />
    </Suspense>
  );
}

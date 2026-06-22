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

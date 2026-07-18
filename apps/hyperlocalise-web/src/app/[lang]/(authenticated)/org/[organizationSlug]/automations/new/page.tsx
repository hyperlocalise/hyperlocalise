import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
} from "@/lib/agents/workspace-automation-view-model";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import {
  evaluateWorkspaceFeatureFlags,
  requireWorkspaceFeatureFlag,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsNewPageContent } from "../_components/automations-new-page-content";

export default async function NewAutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { organizationSlug } = await params;
  const { template } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceAutomationsFlag, auth);
  const flags = await evaluateWorkspaceFeatureFlags(auth);
  const templates = getMergedWorkspaceAutomationTemplates();
  const initialForm = template
    ? (createWorkspaceAutomationFormStateFromTemplate(template, templates) ??
      createDefaultWorkspaceAutomationFormState())
    : createDefaultWorkspaceAutomationFormState();

  return (
    <Suspense fallback={null}>
      <AutomationsNewPageContent
        organizationSlug={organizationSlug}
        initialForm={initialForm}
        knowledgeAvailable={flags.knowledge}
        canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
      />
    </Suspense>
  );
}

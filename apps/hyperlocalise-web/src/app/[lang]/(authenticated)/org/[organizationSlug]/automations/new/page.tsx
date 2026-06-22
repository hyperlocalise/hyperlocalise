import { Suspense } from "react";

import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
} from "@/lib/agents/workspace-automation-view-model";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";
import { requireWorkspaceFeatureFlag, workspaceAutomationsFlag } from "@/lib/flags/workspace-flags";
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
  const templates = getMergedWorkspaceAutomationTemplates();
  const initialForm = template
    ? (createWorkspaceAutomationFormStateFromTemplate(template, templates) ??
      createDefaultWorkspaceAutomationFormState())
    : createDefaultWorkspaceAutomationFormState();

  return (
    <Suspense fallback={null}>
      <AutomationsNewPageContent organizationSlug={organizationSlug} initialForm={initialForm} />
    </Suspense>
  );
}

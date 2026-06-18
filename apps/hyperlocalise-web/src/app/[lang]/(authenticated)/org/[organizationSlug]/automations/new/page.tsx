import { Suspense } from "react";

import {
  createDefaultWorkspaceAutomationFormState,
  createWorkspaceAutomationFormStateFromTemplate,
} from "@/lib/agents/workspace-automation-view-model";
import { getMergedWorkspaceAutomationTemplates } from "@/lib/agents/workspace-automation-templates.server";

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

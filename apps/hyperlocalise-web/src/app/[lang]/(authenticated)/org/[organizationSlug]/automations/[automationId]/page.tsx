import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import {
  evaluateWorkspaceFeatureFlags,
  requireWorkspaceFeatureFlag,
  workspaceAutomationsFlag,
} from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationDetailPageContent } from "../_components/automation-detail-page-content";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; automationId: string }>;
}) {
  const { organizationSlug, automationId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceAutomationsFlag, auth);
  const flags = await evaluateWorkspaceFeatureFlags(auth);

  return (
    <Suspense fallback={null}>
      <AutomationDetailPageContent
        organizationSlug={organizationSlug}
        automationId={automationId}
        knowledgeAvailable={flags.knowledge}
        canUpdateKnowledgeMemory={hasCapability(auth.membership.role, "workspace:update")}
      />
    </Suspense>
  );
}

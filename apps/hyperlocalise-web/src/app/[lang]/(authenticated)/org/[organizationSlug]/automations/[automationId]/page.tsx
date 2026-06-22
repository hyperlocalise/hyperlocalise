import { Suspense } from "react";

import { requireWorkspaceFeatureFlag, workspaceAutomationsFlag } from "@/lib/flags/workspace-flags";
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

  return (
    <Suspense fallback={null}>
      <AutomationDetailPageContent
        organizationSlug={organizationSlug}
        automationId={automationId}
      />
    </Suspense>
  );
}

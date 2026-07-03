import { evaluateWorkspaceFeatureFlags } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { DashboardPageContent } from "./_components/dashboard-page-content";

export default async function OrganizationDashboardPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const flags = await evaluateWorkspaceFeatureFlags(auth);

  return (
    <DashboardPageContent
      organizationSlug={organizationSlug}
      automationsEnabled={flags.automations}
    />
  );
}

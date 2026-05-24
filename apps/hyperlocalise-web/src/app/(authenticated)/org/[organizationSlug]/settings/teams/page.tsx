import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { hasCapability } from "@/api/auth/policy";

import { TeamsSettingsPageContent } from "../_components/teams-page-content";

export default async function TeamsSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TeamsSettingsPageContent
      organizationSlug={organizationSlug}
      canManageAllTeams={hasCapability(auth.membership.role, "teams:write")}
    />
  );
}

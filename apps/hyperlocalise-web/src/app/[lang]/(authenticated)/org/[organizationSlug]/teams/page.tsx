import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { TeamsPageContent } from "./_components/teams-page-content";

export default async function TeamsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TeamsPageContent
      organizationSlug={organizationSlug}
      canManageTeams={hasCapability(auth.membership.role, "teams:write")}
    />
  );
}

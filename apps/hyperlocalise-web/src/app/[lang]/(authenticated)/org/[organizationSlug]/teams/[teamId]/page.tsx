import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { TeamDetailPageContent } from "../_components/team-detail-page-content";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; teamId: string }>;
}) {
  const { organizationSlug, teamId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <TeamDetailPageContent
      organizationSlug={organizationSlug}
      teamId={teamId}
      canManageTeams={hasCapability(auth.membership.role, "teams:write")}
      currentUserWorkosId={auth.user.workosUserId}
    />
  );
}

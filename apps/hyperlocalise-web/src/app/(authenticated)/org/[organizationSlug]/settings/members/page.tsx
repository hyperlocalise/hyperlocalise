import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { hasCapability } from "@/api/auth/policy";

import { MembersSettingsPageContent } from "../_components/members-page-content";

export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <MembersSettingsPageContent
      organizationSlug={organizationSlug}
      canManageMembers={hasCapability(auth.membership.role, "members:invite")}
      currentUserRole={auth.membership.role}
    />
  );
}

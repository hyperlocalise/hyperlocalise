import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { MembersSettingsPageContent } from "../_components/members-page-content";

export default async function MembersSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return <MembersSettingsPageContent organizationSlug={organizationSlug} />;
}

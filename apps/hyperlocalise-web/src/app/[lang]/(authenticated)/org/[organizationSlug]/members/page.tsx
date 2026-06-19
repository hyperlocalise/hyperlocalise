import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { MembersPageContent } from "../settings/_components/members-page-content";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return <MembersPageContent organizationSlug={organizationSlug} />;
}

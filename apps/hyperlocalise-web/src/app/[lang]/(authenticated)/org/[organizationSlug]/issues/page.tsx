import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssuesPageContent } from "./_components/issues-page-content";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return <IssuesPageContent organizationSlug={organizationSlug} />;
}

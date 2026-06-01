import { Suspense } from "react";

import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { AutomationsPageContent } from "./_components/automations-page-content";

export default async function AutomationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <AutomationsPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}

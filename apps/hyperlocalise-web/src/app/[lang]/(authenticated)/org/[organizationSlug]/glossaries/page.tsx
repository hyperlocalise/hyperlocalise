import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { GlossariesPageContent } from "./_components/glossaries-page-content";

export default async function GlossariesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <GlossariesPageContent
        organizationSlug={organizationSlug}
        canCreateGlossaries={hasCapability(auth.membership.role, "glossaries:write")}
      />
    </Suspense>
  );
}

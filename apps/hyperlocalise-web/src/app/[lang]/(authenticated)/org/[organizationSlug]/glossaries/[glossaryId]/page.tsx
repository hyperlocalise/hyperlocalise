import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { GlossaryDetailPageContent } from "./_components/glossary-detail-page-content";

export default async function GlossaryDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; glossaryId: string }>;
}) {
  const { organizationSlug, glossaryId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <GlossaryDetailPageContent
        organizationSlug={organizationSlug}
        glossaryId={glossaryId}
        canManageGlossaries={hasCapability(auth.membership.role, "glossaries:write")}
      />
    </Suspense>
  );
}

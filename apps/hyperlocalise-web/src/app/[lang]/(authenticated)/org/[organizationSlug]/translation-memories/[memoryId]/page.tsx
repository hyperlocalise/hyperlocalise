import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { TranslationMemoryDetailPageContent } from "./_components/translation-memory-detail-page-content";

export default async function TranslationMemoryDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; memoryId: string }>;
}) {
  const { organizationSlug, memoryId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <TranslationMemoryDetailPageContent
        organizationSlug={organizationSlug}
        memoryId={memoryId}
        canManageMemories={hasCapability(auth.membership.role, "memories:write")}
      />
    </Suspense>
  );
}

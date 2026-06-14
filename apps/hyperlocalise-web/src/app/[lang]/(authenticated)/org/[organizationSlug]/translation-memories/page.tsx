import { Suspense } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { TranslationMemoriesPageContent } from "./_components/translation-memories-page-content";

export default async function TranslationMemoriesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <Suspense fallback={null}>
      <TranslationMemoriesPageContent
        organizationSlug={organizationSlug}
        canCreateMemories={hasCapability(auth.membership.role, "memories:write")}
      />
    </Suspense>
  );
}

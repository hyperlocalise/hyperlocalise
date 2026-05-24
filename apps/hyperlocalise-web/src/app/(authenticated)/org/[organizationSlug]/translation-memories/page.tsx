import { Suspense } from "react";

import { TranslationMemoriesPageContent } from "./_components/translation-memories-page-content";

export default async function TranslationMemoriesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return (
    <Suspense fallback={null}>
      <TranslationMemoriesPageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}

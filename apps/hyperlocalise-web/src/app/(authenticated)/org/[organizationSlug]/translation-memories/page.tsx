import { TranslationMemoriesPageContent } from "./_components/translation-memories-page-content";

export default async function TranslationMemoriesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <TranslationMemoriesPageContent organizationSlug={organizationSlug} />;
}

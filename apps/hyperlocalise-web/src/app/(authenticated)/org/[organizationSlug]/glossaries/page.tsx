import { GlossariesPageContent } from "./_components/glossaries-page-content";

export default async function GlossariesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <GlossariesPageContent organizationSlug={organizationSlug} />;
}

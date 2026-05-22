import { ContextPageContent } from "./_components/context-page-content";

export default async function ContextPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <ContextPageContent organizationSlug={organizationSlug} />;
}

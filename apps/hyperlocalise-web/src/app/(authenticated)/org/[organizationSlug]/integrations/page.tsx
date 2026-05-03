import { IntegrationsPageContent } from "./_components/integrations-page-content";

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <IntegrationsPageContent organizationSlug={organizationSlug} />;
}

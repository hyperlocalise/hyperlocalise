import { requireAppCapability } from "@/lib/workos/app-auth";
import { IntegrationsPageContent } from "./_components/integrations-page-content";

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppCapability("integrations:read", { organizationSlug });

  return (
    <IntegrationsPageContent
      organizationSlug={organizationSlug}
      membershipRole={auth.membership.role}
    />
  );
}

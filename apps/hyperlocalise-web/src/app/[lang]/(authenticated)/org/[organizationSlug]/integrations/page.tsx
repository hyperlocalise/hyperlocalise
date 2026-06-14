import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { IntegrationsPageContent } from "./_components/integrations-page-content";

export default async function IntegrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { organizationSlug } = await params;
  const { error } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <IntegrationsPageContent
      organizationSlug={organizationSlug}
      membershipRole={auth.membership.role}
      canManageProviderIntegrations={hasCapability(auth.membership.role, "integrations:read")}
      errorCode={error}
    />
  );
}

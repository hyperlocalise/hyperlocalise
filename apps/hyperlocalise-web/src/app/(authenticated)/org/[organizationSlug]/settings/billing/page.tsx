import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext, requireAppCapability } from "@/lib/workos/app-auth";

import { AutumnBillingProvider } from "./_components/autumn-billing-provider";
import { BillingSettingsPageContent } from "./_components/billing-settings-content";

export default async function BillingSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppCapability("billing:read", { organizationSlug });
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <AutumnBillingProvider organizationSlug={organizationSlug}>
      <BillingSettingsPageContent
        organizationSlug={organizationSlug}
        canManageBilling={hasCapability(auth.membership.role, "billing:write")}
      />
    </AutumnBillingProvider>
  );
}

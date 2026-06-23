import { hasCapability } from "@/api/auth/policy";
import { isAutumnConfigured } from "@/lib/billing/autumn-config";
import { requireAppAuthContext, requireAppCapability } from "@/lib/workos/app-auth";

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
    <BillingSettingsPageContent
      autumnConfigured={isAutumnConfigured()}
      organizationSlug={organizationSlug}
      canManageBilling={hasCapability(auth.membership.role, "billing:write")}
    />
  );
}

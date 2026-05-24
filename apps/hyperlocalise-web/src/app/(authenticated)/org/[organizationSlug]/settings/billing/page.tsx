import { requireAppCapability } from "@/lib/workos/app-auth";
import { BillingSettingsPageContent } from "../_components/settings-pages";

export default async function BillingSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppCapability("billing:read", { organizationSlug });

  return <BillingSettingsPageContent />;
}

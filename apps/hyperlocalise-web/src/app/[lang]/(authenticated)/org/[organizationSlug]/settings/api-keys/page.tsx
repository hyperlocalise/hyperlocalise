import { requireAppCapability } from "@/lib/workos/app-auth";
import { ApiKeySettingsPageContent } from "../_components/api-keys-page-content";

export default async function ApiKeySettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppCapability("api_keys:read", { organizationSlug });

  return <ApiKeySettingsPageContent organizationSlug={organizationSlug} />;
}

import { ApiKeySettingsPageContent } from "../_components/api-keys-page-content";

export default async function ApiKeySettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return <ApiKeySettingsPageContent organizationSlug={organizationSlug} />;
}

import { SettingsPageContent } from "@/components/app/settings-pages";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <SettingsPageContent organizationSlug={organizationSlug} />;
}

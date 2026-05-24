import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { SettingsPageContent } from "./_components/settings-pages";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  return (
    <SettingsPageContent organizationSlug={organizationSlug} capabilities={auth.capabilities} />
  );
}

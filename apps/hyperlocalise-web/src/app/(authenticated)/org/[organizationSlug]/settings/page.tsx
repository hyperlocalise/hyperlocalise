import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { AppShell } from "@/components/app/app-shell";
import { SettingsPageContent } from "@/components/app/settings-page-content";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppAuthContext({ organizationSlug });

  return (
    <AppShell organizationSlug={organizationSlug}>
      <SettingsPageContent organizationSlug={organizationSlug} />
    </AppShell>
  );
}

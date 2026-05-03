import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { AccountSettingsPageContent } from "../_components/settings-pages";

export default async function AccountSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const userName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;

  return (
    <AccountSettingsPageContent
      organizationName={auth.activeOrganization.name}
      organizationSlug={organizationSlug}
      userEmail={auth.sessionUser.email}
      userName={userName}
    />
  );
}

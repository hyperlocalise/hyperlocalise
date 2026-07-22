/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
      canUpdateWorkspace={auth.capabilities.includes("workspace:update")}
      organizationName={auth.activeOrganization.name}
      organizationSlug={organizationSlug}
      userEmail={auth.sessionUser.email}
      userName={userName}
    />
  );
}

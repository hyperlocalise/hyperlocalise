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

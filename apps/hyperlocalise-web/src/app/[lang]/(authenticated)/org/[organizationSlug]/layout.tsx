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
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { AutumnBillingProvider } from "@/lib/billing/autumn-billing-provider";
import { isAutumnConfigured } from "@/lib/billing/autumn-config";

type OrganizationLayoutProps = {
  children: ReactNode;
  params: Promise<{
    organizationSlug: string;
  }>;
};

export default async function OrganizationLayout({ children, params }: OrganizationLayoutProps) {
  const { organizationSlug } = await params;
  const autumnConfigured = isAutumnConfigured();
  const appShell = (
    <AppShell autumnConfigured={autumnConfigured} organizationSlug={organizationSlug}>
      {children}
    </AppShell>
  );

  if (!autumnConfigured) {
    return appShell;
  }

  return (
    <AutumnBillingProvider organizationSlug={organizationSlug}>{appShell}</AutumnBillingProvider>
  );
}

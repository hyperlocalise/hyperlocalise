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

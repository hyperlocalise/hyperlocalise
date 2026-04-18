import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";

type OrganizationLayoutProps = {
  children: ReactNode;
  params: Promise<{
    organizationSlug: string;
  }>;
};

export default async function OrganizationLayout({ children, params }: OrganizationLayoutProps) {
  const { organizationSlug } = await params;

  return <AppShell organizationSlug={organizationSlug}>{children}</AppShell>;
}

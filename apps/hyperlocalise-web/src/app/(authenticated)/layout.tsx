import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { requireWorkosAppAuth } from "@/lib/workos/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { user, auth } = await requireWorkosAppAuth();

  return (
    <AppShell
      user={{
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
        avatarUrl: user.profilePictureUrl ?? undefined,
      }}
      organizationName={auth.organization.name}
      organizationRole={auth.membership.role}
    >
      {children}
    </AppShell>
  );
}

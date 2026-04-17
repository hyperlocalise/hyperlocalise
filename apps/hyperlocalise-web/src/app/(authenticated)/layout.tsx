import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { getDefaultReturnTo, requireWorkosAppAuth } from "@/lib/workos/auth";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const returnTo = await getDefaultReturnTo();
  const authState = await requireWorkosAppAuth(returnTo);

  return (
    <AppShell
      user={{
        email: authState.user.email,
        name:
          [authState.user.firstName, authState.user.lastName].filter(Boolean).join(" ") ||
          authState.user.email,
        avatarUrl: authState.user.profilePictureUrl ?? undefined,
      }}
      activeOrganization={authState.activeOrganization}
      organizations={authState.organizations}
    >
      {children}
    </AppShell>
  );
}

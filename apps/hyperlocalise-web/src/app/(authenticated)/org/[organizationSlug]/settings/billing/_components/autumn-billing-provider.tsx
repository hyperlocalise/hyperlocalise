"use client";

import { AutumnProvider } from "autumn-js/react";

import { AUTUMN_API_PATH_PREFIX, ORGANIZATION_SLUG_HEADER } from "@/lib/billing/autumn-config";

export function AutumnBillingProvider({
  children,
  organizationSlug,
}: {
  children: React.ReactNode;
  organizationSlug: string;
}) {
  return (
    <AutumnProvider
      pathPrefix={AUTUMN_API_PATH_PREFIX}
      includeCredentials
      headers={{
        [ORGANIZATION_SLUG_HEADER]: organizationSlug,
      }}
    >
      {children}
    </AutumnProvider>
  );
}

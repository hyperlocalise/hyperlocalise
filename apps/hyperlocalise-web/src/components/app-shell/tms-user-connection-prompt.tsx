"use client";

import { useTmsUserConnectCta } from "@/app/(authenticated)/org/[organizationSlug]/_hooks/use-tms-user-connect-cta";
import { TmsUserConnectButton } from "@/components/app-shell/tms-user-connect-button";
import { tmsUserConnectionRequiredMessage } from "@/lib/providers/tms-user-connection-shared";

export function TmsUserConnectionErrorPanel({
  organizationSlug,
  resource,
  error,
  className,
}: {
  organizationSlug: string;
  resource: "projects" | "jobs" | "files";
  error: unknown;
  className?: string;
}) {
  const query = useTmsUserConnectCta(organizationSlug);
  const resolved = query.data;

  const heading =
    resolved?.showConnectCta === true
      ? tmsUserConnectionRequiredMessage(resolved.providerKind, resource)
      : "Failed to load provider data.";

  return (
    <div className={className}>
      <p className="text-sm font-medium text-flame-100">{heading}</p>
      {error instanceof Error ? (
        <p className="mt-1 text-xs text-foreground/42">{error.message}</p>
      ) : null}
      {resolved?.showConnectCta ? (
        <TmsUserConnectButton
          organizationSlug={organizationSlug}
          providerKind={resolved.providerKind}
          providerDisplayName={resolved.providerDisplayName}
          className="mt-4 flex"
        />
      ) : null}
    </div>
  );
}

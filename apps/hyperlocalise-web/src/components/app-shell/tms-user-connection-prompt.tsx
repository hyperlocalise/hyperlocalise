"use client";

import { useIntl } from "react-intl";

import { useTmsUserConnectCta } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-tms-user-connect-cta";
import { TmsUserConnectButton } from "@/components/app-shell/tms-user-connect-button";
import { formatTmsUserConnectProviderLabel } from "@/lib/providers/credentials/tms-user-connection-shared";

import { tmsUserConnectionPromptMessages } from "./tms-user-connection-prompt.messages";

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
  const intl = useIntl();
  const query = useTmsUserConnectCta(organizationSlug);
  const resolved = query.data;

  const heading =
    resolved?.showConnectCta === true
      ? intl.formatMessage(tmsUserConnectionPromptMessages.connectionRequired, {
          provider:
            resolved.providerDisplayName ??
            formatTmsUserConnectProviderLabel(resolved.providerKind),
          resource,
        })
      : intl.formatMessage(tmsUserConnectionPromptMessages.loadFailed);

  return (
    <div className={className}>
      <p className="text-sm font-medium text-flame-100">{heading}</p>
      {error instanceof Error ? (
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      ) : null}
      {resolved?.showConnectCta ? (
        <TmsUserConnectButton
          organizationSlug={organizationSlug}
          providerKind={resolved.providerKind}
          providerDisplayName={resolved.providerDisplayName}
          connectMethod={resolved.connectMethod}
          className="mt-4 flex"
        />
      ) : null}
    </div>
  );
}

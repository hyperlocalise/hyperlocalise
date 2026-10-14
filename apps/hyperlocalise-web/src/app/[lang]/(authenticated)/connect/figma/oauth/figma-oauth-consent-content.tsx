"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { TypographyH1 } from "@/components/ui/typography";

import { figmaOauthConsentMessages } from "./figma-oauth-consent.messages";

type ConsentConnectionOption = {
  connectionId: string;
  displayName: string;
  enabled: boolean;
  organizationName: string;
  organizationSlug: string | null;
  projectName: string | null;
};

export function FigmaOauthConsentContent({
  hasRequest,
  connections,
  defaultOrganizationSlug,
}: {
  hasRequest: boolean;
  connections: ConsentConnectionOption[];
  defaultOrganizationSlug: string | null;
}) {
  const intl = useIntl();
  const enabledConnections = connections.filter((connection) => connection.enabled);
  const integrationsHref = defaultOrganizationSlug
    ? `/org/${defaultOrganizationSlug}/integrations`
    : "/auth/select-organization";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <TypographyH1>
          <FormattedMessage {...figmaOauthConsentMessages.title} />
        </TypographyH1>
        <p className="text-sm text-muted-foreground">
          {hasRequest ? (
            <FormattedMessage {...figmaOauthConsentMessages.description} />
          ) : (
            <FormattedMessage {...figmaOauthConsentMessages.missingRequest} />
          )}
        </p>
      </div>

      {hasRequest && enabledConnections.length === 0 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...figmaOauthConsentMessages.noConnections} />
          </p>
          <Button render={<Link href={integrationsHref} />}>
            <FormattedMessage {...figmaOauthConsentMessages.openIntegrations} />
          </Button>
        </div>
      ) : null}

      {hasRequest && enabledConnections.length > 0 ? (
        <form method="post" action="/api/oauth/figma/consent" className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            <FormattedMessage {...figmaOauthConsentMessages.connectionLabel} />
            <select
              name="connectionId"
              required
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={enabledConnections[0]?.connectionId}
              aria-label={intl.formatMessage(figmaOauthConsentMessages.connectionLabel)}
            >
              {enabledConnections.map((connection) => (
                <option key={connection.connectionId} value={connection.connectionId}>
                  {connection.organizationName}
                  {connection.organizationSlug ? ` (${connection.organizationSlug})` : ""}
                  {` · ${connection.displayName}`}
                  {connection.projectName ? ` · ${connection.projectName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <FormattedMessage {...figmaOauthConsentMessages.allow} />
            </Button>
            <Button type="submit" variant="outline" formAction="/api/oauth/figma/deny">
              <FormattedMessage {...figmaOauthConsentMessages.deny} />
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

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
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { brandLogomarkSrc } from "@/lib/brand/brand-assets";

import { sanityOauthConsentMessages } from "./sanity-oauth-consent.messages";

type ConsentConnectionOption = {
  connectionId: string;
  displayName: string;
  enabled: boolean;
  organizationName: string;
  organizationSlug: string | null;
};

type ConsentOrganizationOption = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string | null;
};

export function SanityOauthConsentContent({
  hasRequest,
  studioOrigin,
  connections,
  organizations,
}: {
  hasRequest: boolean;
  studioOrigin: string | null;
  connections: ConsentConnectionOption[];
  organizations: ConsentOrganizationOption[];
}) {
  const intl = useIntl();
  const enabledConnections = connections.filter((connection) => connection.enabled);
  const showConnectionPicker = enabledConnections.length > 0;
  const showOrganizationPicker = !showConnectionPicker && organizations.length > 1;
  const singleOrganizationId =
    !showConnectionPicker && !showOrganizationPicker ? organizations[0]?.organizationId : undefined;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-center gap-3">
          <img
            src="/images/sanity-logo.svg"
            alt={intl.formatMessage(sanityOauthConsentMessages.sanityLogoAlt)}
            className="size-10 rounded-lg"
          />
          <span aria-hidden className="h-px w-6 bg-border" />
          <img
            src={brandLogomarkSrc}
            alt={intl.formatMessage(sanityOauthConsentMessages.hyperlocaliseLogoAlt)}
            className="size-10 rounded-lg"
          />
        </div>

        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            <FormattedMessage {...sanityOauthConsentMessages.title} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {hasRequest ? (
              <>
                <FormattedMessage {...sanityOauthConsentMessages.description} />
                {studioOrigin ? (
                  <span className="mt-2 block text-xs">Studio: {studioOrigin}</span>
                ) : null}
              </>
            ) : (
              <FormattedMessage {...sanityOauthConsentMessages.missingRequest} />
            )}
          </p>
        </div>

        {hasRequest ? (
          <form
            method="post"
            action="/api/oauth/sanity/consent"
            className="mt-5 flex flex-col gap-4"
          >
            {showConnectionPicker ? (
              <label className="flex flex-col gap-2 text-left text-sm font-medium text-foreground">
                <FormattedMessage {...sanityOauthConsentMessages.connectionLabel} />
                <select
                  name="connectionId"
                  required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={enabledConnections[0]?.connectionId}
                  aria-label={intl.formatMessage(sanityOauthConsentMessages.connectionLabel)}
                >
                  {enabledConnections.map((connection) => (
                    <option key={connection.connectionId} value={connection.connectionId}>
                      {connection.organizationName}
                      {connection.organizationSlug ? ` (${connection.organizationSlug})` : ""}
                      {` · ${connection.displayName}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {showOrganizationPicker ? (
              <label className="flex flex-col gap-2 text-left text-sm font-medium text-foreground">
                <FormattedMessage {...sanityOauthConsentMessages.organizationLabel} />
                <select
                  name="organizationId"
                  required
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={organizations[0]?.organizationId}
                  aria-label={intl.formatMessage(sanityOauthConsentMessages.organizationLabel)}
                >
                  {organizations.map((organization) => (
                    <option key={organization.organizationId} value={organization.organizationId}>
                      {organization.organizationName}
                      {organization.organizationSlug ? ` (${organization.organizationSlug})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {singleOrganizationId ? (
              <input type="hidden" name="organizationId" value={singleOrganizationId} />
            ) : null}

            <div className="flex flex-wrap justify-center gap-2">
              <Button type="submit">
                <FormattedMessage {...sanityOauthConsentMessages.allow} />
              </Button>
              <Button type="submit" variant="outline" formAction="/api/oauth/sanity/deny">
                <FormattedMessage {...sanityOauthConsentMessages.deny} />
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

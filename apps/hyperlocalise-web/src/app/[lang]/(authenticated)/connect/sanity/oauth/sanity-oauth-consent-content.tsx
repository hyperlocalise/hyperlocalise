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
import { CaretDownIcon } from "@phosphor-icons/react";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { siSanity } from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import { brandLogomarkLightModeSvgSrc } from "@/lib/brand/brand-assets";
import { cn } from "@/lib/primitives/cn";

import { sanityOauthConsentMessages } from "./sanity-oauth-consent.messages";

function OauthConsentSelect(props: ComponentProps<"select">) {
  const { className, ...selectProps } = props;
  return (
    <div className="relative">
      <select
        {...selectProps}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-input bg-background ps-3 pe-10 text-sm",
          className,
        )}
      />
      <CaretDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 end-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function OauthPartnerLogoMark({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

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
  const showConnectionPicker = enabledConnections.length > 1;
  const singleConnectionId =
    enabledConnections.length === 1 ? enabledConnections[0]?.connectionId : undefined;
  const showOrganizationPicker = enabledConnections.length === 0 && organizations.length > 1;
  const singleOrganizationId =
    enabledConnections.length === 0 && organizations.length === 1
      ? organizations[0]?.organizationId
      : undefined;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-center gap-3">
          <OauthPartnerLogoMark>
            <SimpleBrandIcon
              icon={siSanity}
              colored
              role="img"
              aria-hidden={false}
              aria-label={intl.formatMessage(sanityOauthConsentMessages.sanityLogoAlt)}
              className="size-6"
            />
          </OauthPartnerLogoMark>
          <span aria-hidden className="h-px w-6 shrink-0 bg-border" />
          <OauthPartnerLogoMark className="bg-background p-1.5">
            <Image
              src={brandLogomarkLightModeSvgSrc}
              alt={intl.formatMessage(sanityOauthConsentMessages.hyperlocaliseLogoAlt)}
              width={32}
              height={32}
              className="size-full object-contain"
            />
          </OauthPartnerLogoMark>
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
                <OauthConsentSelect
                  name="connectionId"
                  required
                  defaultValue={enabledConnections[0]?.connectionId}
                  aria-label={intl.formatMessage(sanityOauthConsentMessages.connectionLabel)}
                >
                  {enabledConnections.map((connection) => (
                    <option key={connection.connectionId} value={connection.connectionId}>
                      {connection.organizationName}
                      {connection.organizationSlug ? ` (${connection.organizationSlug})` : ""}
                    </option>
                  ))}
                </OauthConsentSelect>
              </label>
            ) : null}

            {showOrganizationPicker ? (
              <label className="flex flex-col gap-2 text-left text-sm font-medium text-foreground">
                <FormattedMessage {...sanityOauthConsentMessages.organizationLabel} />
                <OauthConsentSelect
                  name="organizationId"
                  required
                  defaultValue={organizations[0]?.organizationId}
                  aria-label={intl.formatMessage(sanityOauthConsentMessages.organizationLabel)}
                >
                  {organizations.map((organization) => (
                    <option key={organization.organizationId} value={organization.organizationId}>
                      {organization.organizationName}
                      {organization.organizationSlug ? ` (${organization.organizationSlug})` : ""}
                    </option>
                  ))}
                </OauthConsentSelect>
              </label>
            ) : null}

            {singleConnectionId ? (
              <input type="hidden" name="connectionId" value={singleConnectionId} />
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

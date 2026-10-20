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
import Image from "next/image";
import { type ReactNode, useId, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { siSanity } from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brandLogomarkLightModeSvgSrc } from "@/lib/brand/brand-assets";
import { cn } from "@/lib/primitives/cn";

import { sanityOauthConsentMessages } from "./sanity-oauth-consent.messages";

function formatWorkspaceOptionLabel(name: string, slug: string | null): string {
  return slug ? `${name} (${slug})` : name;
}

function OauthConsentSelectField({
  fieldId,
  name,
  value,
  onValueChange,
  options,
}: {
  fieldId: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <Select
      name={name}
      required
      value={value}
      items={options}
      onValueChange={(next) => {
        if (next) {
          onValueChange(next);
        }
      }}
    >
      <SelectTrigger id={fieldId} className="h-9 w-full bg-background">
        <SelectValue>{selected?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} label={option.label}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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

  const connectionFieldId = useId();
  const organizationFieldId = useId();
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    () => enabledConnections[0]?.connectionId ?? "",
  );
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(
    () => organizations[0]?.organizationId ?? "",
  );

  const connectionSelectOptions = enabledConnections.map((connection) => ({
    value: connection.connectionId,
    label: formatWorkspaceOptionLabel(connection.organizationName, connection.organizationSlug),
  }));
  const organizationSelectOptions = organizations.map((organization) => ({
    value: organization.organizationId,
    label: formatWorkspaceOptionLabel(organization.organizationName, organization.organizationSlug),
  }));

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
              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={connectionFieldId} className="text-sm font-medium text-foreground">
                  <FormattedMessage {...sanityOauthConsentMessages.connectionLabel} />
                </label>
                <OauthConsentSelectField
                  fieldId={connectionFieldId}
                  name="connectionId"
                  value={selectedConnectionId}
                  onValueChange={setSelectedConnectionId}
                  options={connectionSelectOptions}
                />
              </div>
            ) : null}

            {showOrganizationPicker ? (
              <div className="flex flex-col gap-2 text-left">
                <label
                  htmlFor={organizationFieldId}
                  className="text-sm font-medium text-foreground"
                >
                  <FormattedMessage {...sanityOauthConsentMessages.organizationLabel} />
                </label>
                <OauthConsentSelectField
                  fieldId={organizationFieldId}
                  name="organizationId"
                  value={selectedOrganizationId}
                  onValueChange={setSelectedOrganizationId}
                  options={organizationSelectOptions}
                />
              </div>
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

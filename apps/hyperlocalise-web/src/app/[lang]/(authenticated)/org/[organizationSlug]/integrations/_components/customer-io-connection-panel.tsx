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
import { useEffect, useId, useMemo, useState } from "react";
import { EyeIcon, EyeSlashIcon, FloppyDiskIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import {
  CUSTOMER_IO_PIPES_SLUG,
  CUSTOMER_IO_REGIONS,
  customerIoRegionOptionLabel,
  isCustomerIoRegion,
  type CustomerIoRegion,
} from "@/lib/customer-io/constants";
import { resolveWorkspaceIntegrationSummary } from "@/lib/integrations/workspace-integrations";

import { customerIoConnectionPanelMessages } from "./customer-io-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";
import { pipesConnectionPanelMessages } from "./pipes-connection-panel.messages";
import { usePipesStatus } from "./pipes-connection-panel";

const api = createApiClient();

export function CustomerIoConnectionPanel({
  organizationSlug,
  disabled,
  isLast = false,
}: {
  organizationSlug: string;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const apiKeyFieldId = useId();
  const regionFieldId = useId();
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<CustomerIoRegion | null>(null);
  const statusQuery = usePipesStatus(organizationSlug, CUSTOMER_IO_PIPES_SLUG, expanded);
  const summary = useMemo(
    () => resolveWorkspaceIntegrationSummary(intl, CUSTOMER_IO_PIPES_SLUG),
    [intl],
  );
  const providerName = summary?.name ?? "Customer.io";
  const userCanManage = !disabled;
  const isConnected = Boolean(statusQuery.data?.connected);
  const needsReauthorization = Boolean(statusQuery.data?.needsReauthorization);
  const apiKeyLast4 = statusQuery.data?.apiKeyLast4 ?? null;

  const settingsQuery = useQuery({
    queryKey: ["customer-io", organizationSlug],
    enabled: expanded && isConnected,
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["customer-io"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(customerIoConnectionPanelMessages.loadFailed));
      }
      const body = await response.json();
      const region =
        "customerIo" in body &&
        body.customerIo &&
        typeof body.customerIo === "object" &&
        "region" in body.customerIo &&
        typeof body.customerIo.region === "string" &&
        isCustomerIoRegion(body.customerIo.region)
          ? body.customerIo.region
          : null;
      return { region };
    },
  });

  useEffect(() => {
    if (!settingsQuery.data?.region) {
      return;
    }
    setSelectedRegion(settingsQuery.data.region);
  }, [settingsQuery.data?.region]);

  const disconnect = useMutation({
    mutationFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$delete({
        param: { organizationSlug, provider: CUSTOMER_IO_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(customerIoConnectionPanelMessages.disconnectFailed));
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pipes", organizationSlug, CUSTOMER_IO_PIPES_SLUG],
        }),
        queryClient.invalidateQueries({
          queryKey: ["customer-io", organizationSlug],
        }),
      ]);
      setApiKey("");
      setShowApiKey(false);
      setSelectedRegion(null);
      setExpanded(false);
      toast.success(intl.formatMessage(customerIoConnectionPanelMessages.disconnectedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(customerIoConnectionPanelMessages.disconnectFailed),
      );
    },
  });

  const saveConnection = useMutation({
    mutationFn: async (payload: { region: CustomerIoRegion; apiKey?: string }) => {
      const response = await api.api.orgs[":organizationSlug"]["customer-io"].$put({
        param: { organizationSlug },
        json: payload,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        throw new Error(
          typeof body?.message === "string" && body.message.trim()
            ? body.message
            : intl.formatMessage(customerIoConnectionPanelMessages.saveFailed),
        );
      }
    },
    onSuccess: async () => {
      setApiKey("");
      setShowApiKey(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pipes", organizationSlug, CUSTOMER_IO_PIPES_SLUG],
        }),
        queryClient.invalidateQueries({
          queryKey: ["customer-io", organizationSlug],
        }),
      ]);
      toast.success(intl.formatMessage(customerIoConnectionPanelMessages.savedToast));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(customerIoConnectionPanelMessages.saveFailed),
      );
    },
  });

  const trimmedApiKey = apiKey.trim();
  const savedRegion = settingsQuery.data?.region ?? null;
  const canSave =
    userCanManage &&
    selectedRegion != null &&
    !saveConnection.isPending &&
    (trimmedApiKey.length > 0 || (isConnected && selectedRegion !== savedRegion));

  return (
    <CollapsibleIntegrationRow
      name={providerName}
      description={
        statusQuery.isError
          ? intl.formatMessage(customerIoConnectionPanelMessages.loadErrorDescription)
          : needsReauthorization
            ? intl.formatMessage(pipesConnectionPanelMessages.reconnectHint, { providerName })
            : (summary?.detail ?? "")
      }
      icon={<IntegrationLogo src={summary?.logoSrc ?? "/images/customerio-logo.svg"} />}
      isConnected={isConnected}
      userIsAdmin={userCanManage}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={statusQuery.isLoading}
      isLast={isLast}
    >
      <div className="grid gap-3">
        {needsReauthorization ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...pipesConnectionPanelMessages.reconnectHint}
              values={{ providerName }}
            />
          </p>
        ) : null}
        {isConnected && apiKeyLast4 ? (
          <p className="text-xs text-muted-foreground">
            {intl.formatMessage(customerIoConnectionPanelMessages.tokenSuffix, {
              suffix: apiKeyLast4,
            })}
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            <FormattedMessage {...customerIoConnectionPanelMessages.connectIntro} />
          </p>
        )}
        <Field>
          <FieldLabel htmlFor={apiKeyFieldId}>
            <FormattedMessage {...customerIoConnectionPanelMessages.apiKeyLabel} />
          </FieldLabel>
          <div className="relative">
            <Input
              id={apiKeyFieldId}
              type={showApiKey ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              disabled={!userCanManage || saveConnection.isPending}
              onChange={(event) => setApiKey(event.target.value)}
              className="pe-9"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((current) => !current)}
              disabled={!userCanManage || saveConnection.isPending}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              aria-label={intl.formatMessage(
                showApiKey
                  ? customerIoConnectionPanelMessages.hideApiKeyAriaLabel
                  : customerIoConnectionPanelMessages.showApiKeyAriaLabel,
              )}
            >
              {showApiKey ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...(isConnected
                ? customerIoConnectionPanelMessages.apiKeyRotateHint
                : customerIoConnectionPanelMessages.apiKeyHint)}
            />
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor={regionFieldId}>
            <FormattedMessage {...customerIoConnectionPanelMessages.regionLabel} />
          </FieldLabel>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={intl.formatMessage(customerIoConnectionPanelMessages.regionLabel)}
          >
            {CUSTOMER_IO_REGIONS.map((region) => (
              <Button
                key={region}
                id={region === selectedRegion ? regionFieldId : undefined}
                type="button"
                variant={selectedRegion === region ? "default" : "outline"}
                size="sm"
                disabled={!userCanManage || saveConnection.isPending}
                onClick={() => setSelectedRegion(region)}
                aria-pressed={selectedRegion === region}
              >
                {customerIoRegionOptionLabel(region)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...customerIoConnectionPanelMessages.regionHint} />
          </p>
        </Field>
        {userCanManage ? (
          <div className="flex flex-wrap justify-end gap-2">
            {isConnected ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disconnect.isPending || saveConnection.isPending}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.isPending ? (
                  <FormattedMessage {...customerIoConnectionPanelMessages.disconnecting} />
                ) : (
                  <FormattedMessage {...customerIoConnectionPanelMessages.disconnect} />
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => {
                if (!selectedRegion) {
                  return;
                }
                saveConnection.mutate({
                  region: selectedRegion,
                  ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
                });
              }}
            >
              <FloppyDiskIcon />
              {saveConnection.isPending ? (
                <FormattedMessage {...customerIoConnectionPanelMessages.saving} />
              ) : (
                <FormattedMessage {...customerIoConnectionPanelMessages.save} />
              )}
            </Button>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}

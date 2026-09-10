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
import { useState } from "react";
import { Delete02Icon, SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import type { ZernioConnectionSummary } from "@/lib/zernio/types";

import { CollapsibleIntegrationRow } from "./integration-row";
import { IntegrationLogo } from "./integration-logo";
import { zernioConnectionPanelMessages } from "./zernio-connection-panel.messages";

const api = createApiClient();

type ZernioConnectionForm = {
  displayName: string;
  apiKey: string;
};

const emptyForm = (): ZernioConnectionForm => ({
  displayName: "",
  apiKey: "",
});

export function useZernioConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["zernio-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["zernio-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(zernioConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.zernioConnections as ZernioConnectionSummary[];
    },
  });
}

export function ZernioConnectionPanel({
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
  const connectionsQuery = useZernioConnections(organizationSlug);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ZernioConnectionForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: ZernioConnectionForm) => {
      const apiKey = payload.apiKey.trim();
      if (!apiKey) {
        throw new Error(intl.formatMessage(zernioConnectionPanelMessages.apiKeyRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["zernio-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName: payload.displayName.trim() || "Zernio",
          apiKey,
          enabled: true,
          validate: true,
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(zernioConnectionPanelMessages.saveFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(zernioConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["zernio-connections", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(zernioConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["zernio-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (body?.error === "zernio_connection_in_use") {
          throw new Error(intl.formatMessage(zernioConnectionPanelMessages.deleteInUse));
        }
        throw new Error(
          body?.message || intl.formatMessage(zernioConnectionPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(zernioConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({ queryKey: ["zernio-connections", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(zernioConnectionPanelMessages.deleteFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];
  const isConnected = connections.length > 0;
  const showForm = adding || connections.length === 0;

  function handleExpandedChange(nextExpanded: boolean) {
    setExpanded(nextExpanded);
    if (!nextExpanded) {
      setAdding(false);
      setForm(emptyForm());
      return;
    }
    if (connections.length === 0) {
      setAdding(true);
    }
  }

  return (
    <CollapsibleIntegrationRow
      name={intl.formatMessage(zernioConnectionPanelMessages.rowName)}
      description={intl.formatMessage(zernioConnectionPanelMessages.rowDescription)}
      icon={<IntegrationLogo src="/images/zernio-logo.svg" muted={!isConnected} />}
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={handleExpandedChange}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-5">
        {connections.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{connection.displayName}</div>
                  <p className="text-xs text-muted-foreground">
                    {intl.formatMessage(zernioConnectionPanelMessages.tokenConfigured, {
                      suffix: connection.maskedApiKeySuffix,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {connection.enabled ? (
                    <Badge variant="secondary">
                      <FormattedMessage {...zernioConnectionPanelMessages.enabled} />
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled || deleteMutation.isPending}
                    aria-label={intl.formatMessage(zernioConnectionPanelMessages.delete)}
                    onClick={() => deleteMutation.mutate(connection.id)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {isConnected && !adding ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setAdding(true)}
            >
              <FormattedMessage {...zernioConnectionPanelMessages.addConnection} />
            </Button>
          </div>
        ) : null}

        {showForm ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel>
                <FormattedMessage {...zernioConnectionPanelMessages.displayNameLabel} />
              </FieldLabel>
              <Input
                value={form.displayName}
                disabled={disabled || saveMutation.isPending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...zernioConnectionPanelMessages.apiKeyLabel} />
              </FieldLabel>
              <Input
                type="password"
                autoComplete="off"
                value={form.apiKey}
                disabled={disabled || saveMutation.isPending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, apiKey: event.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage {...zernioConnectionPanelMessages.apiKeyHelp} />
              </p>
            </Field>
            <div className="flex justify-end gap-2">
              {isConnected ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setAdding(false);
                    setForm(emptyForm());
                  }}
                >
                  <FormattedMessage {...zernioConnectionPanelMessages.cancel} />
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={disabled || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                <FormattedMessage {...zernioConnectionPanelMessages.save} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}

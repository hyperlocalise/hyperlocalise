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
import type { AhrefsConnectionSummary } from "@/lib/ahrefs/types";
import { createApiClient } from "@/lib/api-client";

import { ahrefsConnectionPanelMessages } from "./ahrefs-connection-panel.messages";
import { IntegrationLogo } from "./integration-logo";
import { CollapsibleIntegrationRow } from "./integration-row";

const api = createApiClient();

type AhrefsConnectionForm = {
  displayName: string;
  apiKey: string;
};

const emptyForm = (): AhrefsConnectionForm => ({
  displayName: "",
  apiKey: "",
});

export function useAhrefsConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["ahrefs-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["ahrefs-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(ahrefsConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.ahrefsConnections as AhrefsConnectionSummary[];
    },
  });
}

export function AhrefsConnectionPanel({
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
  const connectionsQuery = useAhrefsConnections(organizationSlug);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AhrefsConnectionForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: AhrefsConnectionForm) => {
      const apiKey = payload.apiKey.trim();
      if (!apiKey) {
        throw new Error(intl.formatMessage(ahrefsConnectionPanelMessages.apiKeyRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["ahrefs-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName: payload.displayName.trim() || "Ahrefs",
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
          body?.message || intl.formatMessage(ahrefsConnectionPanelMessages.saveFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(ahrefsConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["ahrefs-connections", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(ahrefsConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["ahrefs-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (body?.error === "ahrefs_connection_in_use") {
          throw new Error(intl.formatMessage(ahrefsConnectionPanelMessages.deleteInUse));
        }
        throw new Error(
          body?.message || intl.formatMessage(ahrefsConnectionPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(ahrefsConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({ queryKey: ["ahrefs-connections", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(ahrefsConnectionPanelMessages.deleteFailed),
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
      name={intl.formatMessage(ahrefsConnectionPanelMessages.rowName)}
      description={intl.formatMessage(ahrefsConnectionPanelMessages.rowDescription)}
      icon={<IntegrationLogo src="/images/ahrefs-logo.svg" />}
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
                    {intl.formatMessage(ahrefsConnectionPanelMessages.tokenConfigured, {
                      suffix: connection.maskedApiKeySuffix,
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {connection.enabled ? (
                    <Badge variant="secondary">
                      <FormattedMessage {...ahrefsConnectionPanelMessages.enabled} />
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled || deleteMutation.isPending}
                    aria-label={intl.formatMessage(ahrefsConnectionPanelMessages.delete)}
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
              <FormattedMessage {...ahrefsConnectionPanelMessages.addConnection} />
            </Button>
          </div>
        ) : null}

        {showForm ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel>
                <FormattedMessage {...ahrefsConnectionPanelMessages.displayNameLabel} />
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
                <FormattedMessage {...ahrefsConnectionPanelMessages.apiKeyLabel} />
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
                <FormattedMessage {...ahrefsConnectionPanelMessages.apiKeyHelp} />
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
                  <FormattedMessage {...ahrefsConnectionPanelMessages.cancel} />
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={disabled || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                <FormattedMessage {...ahrefsConnectionPanelMessages.save} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}

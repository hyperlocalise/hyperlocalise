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
import { FloppyDiskIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiClient } from "@/lib/api-client";
import { getIntegrationIconForKey } from "@/lib/integrations/integration-icons";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type { SanityConnectionSummary } from "@/lib/sanity/types";

import { CollapsibleIntegrationRow } from "./integration-row";
import { SimpleBrandIcon } from "./simple-brand-icon";
import { sanityStudioPluginConnectionPanelMessages } from "./sanity-studio-plugin-connection-panel.messages";

const api = createApiClient();
const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];

type ConnectionForm = {
  displayName: string;
  apiKeyId: string;
};

const emptyForm = (): ConnectionForm => ({
  displayName: "Sanity Studio",
  apiKeyId: "",
});

export function SanityStudioPluginConnectionPanel({
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
  const { client: goSvcClient } = useGoSvcClient();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ConnectionForm>(emptyForm);

  const connectionsQuery = useQuery({
    queryKey: ["sanity-studio-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["sanity-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(sanityStudioPluginConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.sanityConnections as SanityConnectionSummary[];
    },
  });

  const apiKeysQuery = useQuery({
    queryKey: ["api-keys", organizationSlug],
    queryFn: async () => {
      try {
        const body = await goSvcClient.apiKey.list(organizationSlug);
        return (body.apiKeys ?? []).filter(
          (apiKey) =>
            !apiKey.revokedAt &&
            REQUIRED_API_KEY_PERMISSIONS.every((permission) =>
              apiKey.permissions.includes(permission),
            ),
        );
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(sanityStudioPluginConnectionPanelMessages.fetchFailed),
          ),
          { cause: error },
        );
      }
    },
    enabled: expanded,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: ConnectionForm) => {
      const displayName = payload.displayName.trim();
      if (!displayName) {
        throw new Error(
          intl.formatMessage(sanityStudioPluginConnectionPanelMessages.displayNameRequired),
        );
      }
      if (!payload.apiKeyId) {
        throw new Error(
          intl.formatMessage(sanityStudioPluginConnectionPanelMessages.apiKeyRequired),
        );
      }

      const response = await api.api.orgs[":organizationSlug"]["sanity-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName,
          apiKeyId: payload.apiKeyId,
          enabled: true,
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(
          body?.message || intl.formatMessage(sanityStudioPluginConnectionPanelMessages.saveFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(sanityStudioPluginConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({
        queryKey: ["sanity-studio-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(sanityStudioPluginConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["sanity-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(sanityStudioPluginConnectionPanelMessages.deleteFailed));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(sanityStudioPluginConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["sanity-studio-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(sanityStudioPluginConnectionPanelMessages.deleteFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];
  const isConnected = connections.some((connection) => connection.enabled);
  const showForm = adding || connections.length === 0;
  const apiKeys = apiKeysQuery.data ?? [];

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
      name={intl.formatMessage(sanityStudioPluginConnectionPanelMessages.rowName)}
      description={intl.formatMessage(sanityStudioPluginConnectionPanelMessages.rowDescription)}
      icon={<SimpleBrandIcon icon={getIntegrationIconForKey("sanity")} colored={isConnected} />}
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={handleExpandedChange}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...sanityStudioPluginConnectionPanelMessages.oauthHint} />
        </p>

        {connections.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="truncate text-sm text-foreground">{connection.displayName}</div>
                <div className="flex items-center gap-2">
                  {connection.enabled ? (
                    <Badge variant="secondary">
                      <FormattedMessage {...sanityStudioPluginConnectionPanelMessages.enabled} />
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={disabled || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(connection.id)}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {showForm ? (
          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel>
                <FormattedMessage {...sanityStudioPluginConnectionPanelMessages.displayNameLabel} />
              </FieldLabel>
              <Input
                value={form.displayName}
                disabled={disabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...sanityStudioPluginConnectionPanelMessages.apiKeyLabel} />
              </FieldLabel>
              <Select
                value={form.apiKeyId}
                onValueChange={(apiKeyId) =>
                  setForm((current) => ({ ...current, apiKeyId: apiKeyId ?? "" }))
                }
                disabled={disabled || apiKeysQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={intl.formatMessage(
                      sanityStudioPluginConnectionPanelMessages.apiKeyLabel,
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {apiKeys.map((apiKey) => (
                    <SelectItem key={apiKey.id} value={apiKey.id}>
                      {apiKey.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              type="button"
              disabled={disabled || saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              <FloppyDiskIcon />
              <FormattedMessage {...sanityStudioPluginConnectionPanelMessages.addConnection} />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            <FormattedMessage {...sanityStudioPluginConnectionPanelMessages.addConnection} />
          </Button>
        )}
      </div>
    </CollapsibleIntegrationRow>
  );
}

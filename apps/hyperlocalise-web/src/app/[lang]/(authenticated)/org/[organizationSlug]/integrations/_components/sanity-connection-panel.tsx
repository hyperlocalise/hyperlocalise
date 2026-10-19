"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */
import { createElement, useState } from "react";
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
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type { SanityConnectionSummary } from "@/lib/sanity/types";

import { sanityConnectionPanelMessages } from "./sanity-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";
import { IntegrationLogo } from "./integration-logo";

const api = createApiClient();
const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];

type SanityConnectionForm = {
  displayName: string;
  apiKeyId: string;
};

const emptyForm = (): SanityConnectionForm => ({
  displayName: "Sanity",
  apiKeyId: "",
});

export function useSanityConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["sanity-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["sanity-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.sanityConnections as SanityConnectionSummary[];
    },
  });
}

export function SanityConnectionPanel({
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
  const connectionsQuery = useSanityConnections(organizationSlug);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SanityConnectionForm>(emptyForm);

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
          goSvcErrorMessage(error, intl.formatMessage(sanityConnectionPanelMessages.fetchFailed)),
          { cause: error },
        );
      }
    },
    enabled: expanded,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: SanityConnectionForm) => {
      const displayName = payload.displayName.trim();
      if (!displayName) {
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.displayNameRequired));
      }
      if (!payload.apiKeyId) {
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.apiKeyRequired));
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
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(sanityConnectionPanelMessages.saveFailed),
        );
      }
      return response.json() as Promise<{ sanityConnection: SanityConnectionSummary }>;
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(sanityConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({
        queryKey: ["sanity-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(sanityConnectionPanelMessages.saveFailed),
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
        throw new Error(intl.formatMessage(sanityConnectionPanelMessages.deleteFailed));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(sanityConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["sanity-connections", organizationSlug],
      });
    },
    onError: () => {
      toast.error(intl.formatMessage(sanityConnectionPanelMessages.deleteFailed));
    },
  });

  const connections = connectionsQuery.data ?? [];

  const isConnected = connections.length > 0;

  return (
    <CollapsibleIntegrationRow
      name={intl.formatMessage(sanityConnectionPanelMessages.title)}
      description={intl.formatMessage(sanityConnectionPanelMessages.description)}
      icon={<IntegrationLogo src="/images/contentful-logo.svg" />}
      isConnected={isConnected}
      userIsAdmin={!disabled}
      expanded={expanded}
      onExpandedChange={setExpanded}
      isLoading={connectionsQuery.isLoading}
      isLast={isLast}
    >
      <div className="flex flex-col gap-4">
        {connections.map((connection) => (
          <div
            key={connection.id}
            className="flex items-center justify-between gap-2 rounded-md border p-3"
          >
            <div>
              <p className="font-medium">{connection.displayName}</p>
              <p className="text-muted-foreground text-sm">{connection.id}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(connection.id)}
            >
              <TrashIcon />
            </Button>
          </div>
        ))}

        {adding ? (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <Field>
              <FieldLabel>
                <FormattedMessage {...sanityConnectionPanelMessages.displayNameLabel} />
              </FieldLabel>
              <Input
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, displayName: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...sanityConnectionPanelMessages.apiKeyLabel} />
              </FieldLabel>
              <Select
                value={form.apiKeyId}
                onValueChange={(apiKeyId) =>
                  setForm((prev) => ({ ...prev, apiKeyId: apiKeyId ?? "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="API key" />
                </SelectTrigger>
                <SelectContent>
                  {(apiKeysQuery.data ?? []).map((apiKey) => (
                    <SelectItem key={apiKey.id} value={apiKey.id}>
                      {apiKey.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={disabled || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                <FloppyDiskIcon />
                <FormattedMessage {...sanityConnectionPanelMessages.save} />
              </Button>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                <FormattedMessage {...sanityConnectionPanelMessages.cancel} />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setAdding(true)}
          >
            <FormattedMessage {...sanityConnectionPanelMessages.addConnection} />
          </Button>
        )}
      </div>
    </CollapsibleIntegrationRow>
  );
}

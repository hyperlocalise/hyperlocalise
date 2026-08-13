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
import { siIntercom } from "simple-icons";
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
import {
  INTERCOM_REST_ENDPOINTS,
  intercomRestEndpointLabel,
  type IntercomRestEndpoint,
} from "@/lib/intercom/constants";
import type { IntercomConnectionSummary } from "@/lib/intercom/types";

import { SimpleBrandIcon } from "./simple-brand-icon";
import { intercomConnectionPanelMessages } from "./intercom-connection-panel.messages";

const api = createApiClient();

type IntercomConnectionForm = {
  displayName: string;
  accessToken: string;
  restEndpoint: IntercomRestEndpoint;
};

const emptyForm = (): IntercomConnectionForm => ({
  displayName: "",
  accessToken: "",
  restEndpoint: "us",
});

export function useIntercomConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["intercom-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["intercom-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(intercomConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.intercomConnections as IntercomConnectionSummary[];
    },
  });
}

export function IntercomConnectionPanel({
  organizationSlug,
  disabled,
}: {
  organizationSlug: string;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const connectionsQuery = useIntercomConnections(organizationSlug);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<IntercomConnectionForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: IntercomConnectionForm) => {
      const accessToken = payload.accessToken.trim();
      if (!accessToken) {
        throw new Error(intl.formatMessage(intercomConnectionPanelMessages.accessTokenRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["intercom-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName: payload.displayName.trim() || "Intercom",
          accessToken,
          restEndpoint: payload.restEndpoint,
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
          body?.message || intl.formatMessage(intercomConnectionPanelMessages.saveFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(intercomConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({
        queryKey: ["intercom-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(intercomConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["intercom-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(intercomConnectionPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(intercomConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["intercom-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(intercomConnectionPanelMessages.deleteFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];

  const endpointLabelMessage = (endpoint: IntercomRestEndpoint) => {
    switch (endpoint) {
      case "us":
        return intercomConnectionPanelMessages.restEndpointUs;
      case "eu":
        return intercomConnectionPanelMessages.restEndpointEu;
      case "au":
        return intercomConnectionPanelMessages.restEndpointAu;
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SimpleBrandIcon icon={siIntercom} colored={false} className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              <FormattedMessage {...intercomConnectionPanelMessages.rowName} />
            </div>
            <p className="mt-1 text-xs text-pretty text-muted-foreground">
              <FormattedMessage {...intercomConnectionPanelMessages.rowDescription} />
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
        >
          <FormattedMessage {...intercomConnectionPanelMessages.addConnection} />
        </Button>
      </div>

      {connections.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...intercomConnectionPanelMessages.emptyState} />
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {connections.map((connection) => (
          <li
            key={connection.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{connection.displayName}</div>
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage(intercomConnectionPanelMessages.tokenConfigured, {
                  region: intercomRestEndpointLabel(connection.restEndpoint),
                  suffix: connection.maskedAccessTokenSuffix,
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {connection.enabled ? (
                <Badge variant="secondary">
                  <FormattedMessage {...intercomConnectionPanelMessages.enabled} />
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled || deleteMutation.isPending}
                aria-label={intl.formatMessage(intercomConnectionPanelMessages.delete)}
                onClick={() => deleteMutation.mutate(connection.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <Field>
            <FieldLabel>
              <FormattedMessage {...intercomConnectionPanelMessages.displayNameLabel} />
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
              <FormattedMessage {...intercomConnectionPanelMessages.accessTokenLabel} />
            </FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              value={form.accessToken}
              disabled={disabled || saveMutation.isPending}
              onChange={(event) =>
                setForm((current) => ({ ...current, accessToken: event.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              <FormattedMessage {...intercomConnectionPanelMessages.accessTokenHelp} />
            </p>
          </Field>
          <Field>
            <FieldLabel>
              <FormattedMessage {...intercomConnectionPanelMessages.restEndpointLabel} />
            </FieldLabel>
            <Select
              value={form.restEndpoint}
              disabled={disabled || saveMutation.isPending}
              onValueChange={(value) => {
                if (
                  typeof value === "string" &&
                  (INTERCOM_REST_ENDPOINTS as readonly string[]).includes(value)
                ) {
                  setForm((current) => ({
                    ...current,
                    restEndpoint: value as IntercomRestEndpoint,
                  }));
                }
              }}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERCOM_REST_ENDPOINTS.map((endpoint) => (
                  <SelectItem key={endpoint} value={endpoint}>
                    <FormattedMessage {...endpointLabelMessage(endpoint)} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <FormattedMessage {...intercomConnectionPanelMessages.restEndpointHelp} />
            </p>
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saveMutation.isPending}
              onClick={() => {
                setAdding(false);
                setForm(emptyForm());
              }}
            >
              <FormattedMessage {...intercomConnectionPanelMessages.cancel} />
            </Button>
            <Button
              type="button"
              disabled={disabled || saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...intercomConnectionPanelMessages.save} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

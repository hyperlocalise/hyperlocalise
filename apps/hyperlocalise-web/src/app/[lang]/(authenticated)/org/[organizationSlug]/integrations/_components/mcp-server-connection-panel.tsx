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
import { Delete02Icon, SaveIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { Textarea } from "@/components/ui/textarea";
import { createApiClient } from "@/lib/api-client";
import type {
  McpServerAuthKind,
  McpServerConnectionSummary,
  McpServerTransport,
} from "@/lib/mcp-server-connections/types";

import { mcpServerConnectionPanelMessages } from "./mcp-server-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";

const api = createApiClient();

type McpServerConnectionForm = {
  displayName: string;
  serverUrl: string;
  transport: McpServerTransport;
  authKind: McpServerAuthKind;
  bearerToken: string;
  headersJson: string;
};

const emptyForm = (): McpServerConnectionForm => ({
  displayName: "",
  serverUrl: "",
  transport: "http",
  authKind: "none",
  bearerToken: "",
  headersJson: "",
});

function parseHeadersJson(
  value: string,
): { ok: true; headers?: Record<string, string> } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, headers: undefined };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    const headers: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry !== "string") {
        return { ok: false };
      }
      headers[key] = entry;
    }
    return { ok: true, headers };
  } catch {
    return { ok: false };
  }
}

export function useMcpServerConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["mcp-server-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["mcp-server-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(mcpServerConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.mcpServerConnections as McpServerConnectionSummary[];
    },
  });
}

export function McpServerConnectionPanel({
  organizationSlug,
  disabled,
  isLast = true,
}: {
  organizationSlug: string;
  disabled?: boolean;
  isLast?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const connectionsQuery = useMcpServerConnections(organizationSlug);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<McpServerConnectionForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: McpServerConnectionForm) => {
      const headersResult = parseHeadersJson(payload.headersJson);
      if (!headersResult.ok) {
        throw new Error(intl.formatMessage(mcpServerConnectionPanelMessages.invalidHeaders));
      }

      const response = await api.api.orgs[":organizationSlug"]["mcp-server-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName: payload.displayName.trim(),
          serverUrl: payload.serverUrl.trim(),
          transport: payload.transport,
          authKind: payload.authKind,
          bearerToken: payload.bearerToken.trim() || undefined,
          headers: headersResult.headers,
          enabled: true,
        },
      });

      if (!response.ok) {
        throw new Error(intl.formatMessage(mcpServerConnectionPanelMessages.saveFailed));
      }

      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(mcpServerConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({
        queryKey: ["mcp-server-connections", organizationSlug],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["mcp-server-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(mcpServerConnectionPanelMessages.deleteFailed));
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(mcpServerConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["mcp-server-connections", organizationSlug],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
      name={intl.formatMessage(mcpServerConnectionPanelMessages.rowName)}
      description={intl.formatMessage(mcpServerConnectionPanelMessages.rowDescription)}
      icon={<HugeiconsIcon icon={SourceCodeIcon} strokeWidth={1.8} className="size-5" />}
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
                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {connection.displayName}
                    </p>
                    <Badge variant="outline">{connection.transport.toUpperCase()}</Badge>
                    <Badge variant="outline">{connection.authKind}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{connection.serverUrl}</p>
                  {connection.authKind !== "none" ? (
                    <p className="text-xs text-muted-foreground">
                      {intl.formatMessage(mcpServerConnectionPanelMessages.tokenConfigured, {
                        suffix: connection.maskedTokenSuffix,
                      })}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || deleteMutation.isPending}
                  aria-label={intl.formatMessage(mcpServerConnectionPanelMessages.delete)}
                  onClick={() => deleteMutation.mutate(connection.id)}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                </Button>
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
              <FormattedMessage {...mcpServerConnectionPanelMessages.addServer} />
            </Button>
          </div>
        ) : null}

        {showForm ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel>
                <FormattedMessage {...mcpServerConnectionPanelMessages.displayNameLabel} />
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
                <FormattedMessage {...mcpServerConnectionPanelMessages.serverUrlLabel} />
              </FieldLabel>
              <Input
                value={form.serverUrl}
                disabled={disabled || saveMutation.isPending}
                placeholder="https://example.com/mcp"
                onChange={(event) =>
                  setForm((current) => ({ ...current, serverUrl: event.target.value }))
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>
                  <FormattedMessage {...mcpServerConnectionPanelMessages.transportLabel} />
                </FieldLabel>
                <Select
                  value={form.transport}
                  disabled={disabled || saveMutation.isPending}
                  onValueChange={(value) => {
                    if (value !== "http" && value !== "sse") {
                      return;
                    }
                    setForm((current) => ({ ...current, transport: value }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="http"
                      label={intl.formatMessage(mcpServerConnectionPanelMessages.transportHttp)}
                    >
                      <FormattedMessage {...mcpServerConnectionPanelMessages.transportHttp} />
                    </SelectItem>
                    <SelectItem
                      value="sse"
                      label={intl.formatMessage(mcpServerConnectionPanelMessages.transportSse)}
                    >
                      <FormattedMessage {...mcpServerConnectionPanelMessages.transportSse} />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  <FormattedMessage {...mcpServerConnectionPanelMessages.authKindLabel} />
                </FieldLabel>
                <Select
                  value={form.authKind}
                  disabled={disabled || saveMutation.isPending}
                  onValueChange={(value) => {
                    if (value !== "none" && value !== "bearer" && value !== "headers") {
                      return;
                    }
                    setForm((current) => ({ ...current, authKind: value }));
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      value="none"
                      label={intl.formatMessage(mcpServerConnectionPanelMessages.authNone)}
                    >
                      <FormattedMessage {...mcpServerConnectionPanelMessages.authNone} />
                    </SelectItem>
                    <SelectItem
                      value="bearer"
                      label={intl.formatMessage(mcpServerConnectionPanelMessages.authBearer)}
                    >
                      <FormattedMessage {...mcpServerConnectionPanelMessages.authBearer} />
                    </SelectItem>
                    <SelectItem
                      value="headers"
                      label={intl.formatMessage(mcpServerConnectionPanelMessages.authHeaders)}
                    >
                      <FormattedMessage {...mcpServerConnectionPanelMessages.authHeaders} />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {form.authKind === "bearer" ? (
              <Field>
                <FieldLabel>
                  <FormattedMessage {...mcpServerConnectionPanelMessages.bearerTokenLabel} />
                </FieldLabel>
                <Input
                  type="password"
                  value={form.bearerToken}
                  disabled={disabled || saveMutation.isPending}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, bearerToken: event.target.value }))
                  }
                />
              </Field>
            ) : null}
            {form.authKind === "headers" ? (
              <Field>
                <FieldLabel>
                  <FormattedMessage {...mcpServerConnectionPanelMessages.headersLabel} />
                </FieldLabel>
                <Textarea
                  value={form.headersJson}
                  disabled={disabled || saveMutation.isPending}
                  placeholder={intl.formatMessage(
                    mcpServerConnectionPanelMessages.headersPlaceholder,
                  )}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, headersJson: event.target.value }))
                  }
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {isConnected ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setAdding(false);
                    setForm(emptyForm());
                  }}
                >
                  <FormattedMessage {...mcpServerConnectionPanelMessages.cancel} />
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={disabled || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                <FormattedMessage {...mcpServerConnectionPanelMessages.save} />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </CollapsibleIntegrationRow>
  );
}

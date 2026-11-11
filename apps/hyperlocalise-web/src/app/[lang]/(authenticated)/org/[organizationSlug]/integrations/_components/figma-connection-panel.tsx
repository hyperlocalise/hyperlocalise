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
import { createElement, useEffect, useState } from "react";
import { CheckIcon, CopyIcon, FloppyDiskIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { FigmaConnectionSummary } from "@/lib/figma/types";

import { figmaConnectionPanelMessages } from "./figma-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";
import { IntegrationLogo } from "./integration-logo";

const api = createApiClient();
const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];

function isLocalHostName(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

type FigmaConnectionForm = {
  displayName: string;
  apiKeyId: string;
};

const emptyForm = (): FigmaConnectionForm => ({
  displayName: "Figma",
  apiKeyId: "",
});

export function useFigmaConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["figma-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["figma-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(figmaConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.figmaConnections as FigmaConnectionSummary[];
    },
  });
}

export function FigmaConnectionPanel({
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
  const connectionsQuery = useFigmaConnections(organizationSlug);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FigmaConnectionForm>(emptyForm);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLocalTokenActions, setShowLocalTokenActions] = useState(false);

  useEffect(() => {
    setShowLocalTokenActions(isLocalHostName(window.location.hostname));
  }, []);

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
          goSvcErrorMessage(error, intl.formatMessage(figmaConnectionPanelMessages.fetchFailed)),
          { cause: error },
        );
      }
    },
    enabled: expanded,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: FigmaConnectionForm) => {
      const displayName = payload.displayName.trim();
      if (!displayName) {
        throw new Error(intl.formatMessage(figmaConnectionPanelMessages.displayNameRequired));
      }
      if (!payload.apiKeyId) {
        throw new Error(intl.formatMessage(figmaConnectionPanelMessages.apiKeyRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["figma-connections"].$post({
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
          body?.message || intl.formatMessage(figmaConnectionPanelMessages.saveFailed),
        );
      }
      return response.json() as Promise<{
        figmaConnection: FigmaConnectionSummary;
        connectionToken: string;
      }>;
    },
    onSuccess: async (result) => {
      toast.success(intl.formatMessage(figmaConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      if (isLocalHostName(window.location.hostname)) {
        setRevealedToken(result.connectionToken);
      }
      await queryClient.invalidateQueries({
        queryKey: ["figma-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(figmaConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["figma-connections"][
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
          body?.message || intl.formatMessage(figmaConnectionPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(figmaConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["figma-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(figmaConnectionPanelMessages.deleteFailed),
      );
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["figma-connections"][
        ":connectionId"
      ]["regenerate-token"].$post({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(figmaConnectionPanelMessages.regenerateFailed),
        );
      }
      return response.json() as Promise<{
        figmaConnection: FigmaConnectionSummary;
        connectionToken: string;
      }>;
    },
    onSuccess: async (result) => {
      setRevealedToken(result.connectionToken);
      await queryClient.invalidateQueries({
        queryKey: ["figma-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(figmaConnectionPanelMessages.regenerateFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];
  const isConnected = connections.length > 0;
  const showForm = adding || connections.length === 0;
  const apiKeys = apiKeysQuery.data ?? [];
  const apiKeyItems = apiKeys.map((apiKey) => ({ value: apiKey.id, label: apiKey.name }));
  const selectedApiKeyLabel = form.apiKeyId
    ? (apiKeyItems.find((item) => item.value === form.apiKeyId)?.label ?? form.apiKeyId)
    : undefined;

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

  async function handleCopyToken() {
    if (!revealedToken) {
      return;
    }
    await navigator.clipboard.writeText(revealedToken);
    setCopied(true);
  }

  return (
    <>
      <CollapsibleIntegrationRow
        name={intl.formatMessage(figmaConnectionPanelMessages.rowName)}
        description={intl.formatMessage(figmaConnectionPanelMessages.rowDescription)}
        icon={<IntegrationLogo src="/images/figma-logo.svg" />}
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
                    {showLocalTokenActions ? (
                      <p className="text-xs text-muted-foreground">
                        {intl.formatMessage(figmaConnectionPanelMessages.tokenPrefix, {
                          prefix: connection.connectionTokenPrefix,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {connection.enabled ? (
                      <Badge variant="secondary">
                        <FormattedMessage {...figmaConnectionPanelMessages.enabled} />
                      </Badge>
                    ) : null}
                    {showLocalTokenActions ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || regenerateMutation.isPending}
                        onClick={() => regenerateMutation.mutate(connection.id)}
                      >
                        <FormattedMessage {...figmaConnectionPanelMessages.regenerate} />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled || deleteMutation.isPending}
                      aria-label={intl.formatMessage(figmaConnectionPanelMessages.delete)}
                      onClick={() => deleteMutation.mutate(connection.id)}
                    >
                      <TrashIcon />
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
                <FormattedMessage {...figmaConnectionPanelMessages.addConnection} />
              </Button>
            </div>
          ) : null}

          {showForm ? (
            <div className="grid gap-3">
              <Field>
                <FieldLabel>
                  <FormattedMessage {...figmaConnectionPanelMessages.displayNameLabel} />
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
                  <FormattedMessage {...figmaConnectionPanelMessages.apiKeyLabel} />
                </FieldLabel>
                <Select
                  value={form.apiKeyId || null}
                  items={apiKeyItems}
                  disabled={disabled || saveMutation.isPending || apiKeys.length === 0}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setForm((current) => ({ ...current, apiKeyId: value }));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue
                      placeholder={intl.formatMessage(
                        figmaConnectionPanelMessages.apiKeyPlaceholder,
                      )}
                    >
                      {selectedApiKeyLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {apiKeys.map((apiKey) => (
                      <SelectItem key={apiKey.id} value={apiKey.id} label={apiKey.name}>
                        {apiKey.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {apiKeys.length === 0 ? (
                    <FormattedMessage {...figmaConnectionPanelMessages.noEligibleApiKeys} />
                  ) : (
                    <FormattedMessage {...figmaConnectionPanelMessages.apiKeyHelp} />
                  )}
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
                    <FormattedMessage {...figmaConnectionPanelMessages.cancel} />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={disabled || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(form)}
                >
                  <FloppyDiskIcon />
                  <FormattedMessage {...figmaConnectionPanelMessages.save} />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleIntegrationRow>

      <Dialog
        open={revealedToken !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevealedToken(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...figmaConnectionPanelMessages.tokenDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...figmaConnectionPanelMessages.tokenDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={revealedToken ?? ""} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void handleCopyToken()}>
              {createElement(copied ? CheckIcon : CopyIcon, {})}
              {copied ? (
                <FormattedMessage {...figmaConnectionPanelMessages.copied} />
              ) : (
                <FormattedMessage {...figmaConnectionPanelMessages.copyToken} />
              )}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setRevealedToken(null);
                setCopied(false);
              }}
            >
              <FormattedMessage {...figmaConnectionPanelMessages.done} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

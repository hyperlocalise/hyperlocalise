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
import { Copy01Icon, Delete02Icon, SaveIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import type { CanvaConnectionSummary } from "@/lib/canva/types";

import { canvaConnectionPanelMessages } from "./canva-connection-panel.messages";
import { CollapsibleIntegrationRow } from "./integration-row";
import { IntegrationLogo } from "./integration-logo";

const api = createApiClient();
const REQUIRED_API_KEY_PERMISSIONS = ["files:read", "files:write", "jobs:read", "jobs:write"];

type CanvaConnectionForm = {
  displayName: string;
  apiKeyId: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string;
};

const emptyForm = (): CanvaConnectionForm => ({
  displayName: "Canva",
  apiKeyId: "",
  projectId: "",
  sourceLocale: "en",
  targetLocales: "es, fr, de",
});

function parseTargetLocales(value: string) {
  return value
    .split(/[,\s]+/)
    .map((locale) => locale.trim())
    .filter((locale) => locale.length > 0);
}

export function useCanvaConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["canva-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["canva-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.canvaConnections as CanvaConnectionSummary[];
    },
  });
}

export function CanvaConnectionPanel({
  organizationSlug,
  disabled,
  isLast = false,
  claimId,
}: {
  organizationSlug: string;
  disabled?: boolean;
  isLast?: boolean;
  claimId?: string | null;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const connectionsQuery = useCanvaConnections(organizationSlug);
  const [expanded, setExpanded] = useState(Boolean(claimId));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CanvaConnectionForm>(emptyForm);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const apiKeysQuery = useQuery({
    queryKey: ["api-keys", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["api-keys"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return (body.apiKeys ?? []).filter(
        (apiKey: { revokedAt?: string | null; permissions: string[] }) =>
          !apiKey.revokedAt &&
          REQUIRED_API_KEY_PERMISSIONS.every((permission) =>
            apiKey.permissions.includes(permission),
          ),
      ) as Array<{ id: string; name: string }>;
    },
    enabled: expanded,
  });

  const projectsQuery = useQuery({
    queryKey: ["org-projects", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.projects.map((project: { id: string; name: string }) => ({
        id: project.id,
        name: project.name,
      }));
    },
    enabled: expanded,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: CanvaConnectionForm) => {
      const displayName = payload.displayName.trim();
      if (!displayName) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.displayNameRequired));
      }
      if (!payload.apiKeyId) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.apiKeyRequired));
      }
      if (!payload.projectId) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.projectRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["canva-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName,
          apiKeyId: payload.apiKeyId,
          projectId: payload.projectId,
          sourceLocale: payload.sourceLocale.trim() || "en",
          targetLocales: parseTargetLocales(payload.targetLocales),
          enabled: true,
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(canvaConnectionPanelMessages.saveFailed),
        );
      }
      return response.json() as Promise<{
        canvaConnection: CanvaConnectionSummary;
        connectionToken: string;
      }>;
    },
    onSuccess: async (result) => {
      toast.success(intl.formatMessage(canvaConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      setRevealedToken(result.connectionToken);
      await queryClient.invalidateQueries({
        queryKey: ["canva-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(canvaConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["canva-connections"][
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
          body?.message || intl.formatMessage(canvaConnectionPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(canvaConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["canva-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(canvaConnectionPanelMessages.deleteFailed),
      );
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["canva-connections"][
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
          body?.message || intl.formatMessage(canvaConnectionPanelMessages.regenerateFailed),
        );
      }
      return response.json() as Promise<{
        canvaConnection: CanvaConnectionSummary;
        connectionToken: string;
      }>;
    },
    onSuccess: async (result) => {
      setRevealedToken(result.connectionToken);
      await queryClient.invalidateQueries({
        queryKey: ["canva-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(canvaConnectionPanelMessages.regenerateFailed),
      );
    },
  });

  const authorizeMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      if (!claimId) {
        throw new Error(intl.formatMessage(canvaConnectionPanelMessages.claimMissing));
      }
      const response = await api.api.orgs[":organizationSlug"]["canva-connections"][
        ":connectionId"
      ]["complete-claim"].$post({
        param: { organizationSlug, connectionId },
        json: { claimId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          body?.message || intl.formatMessage(canvaConnectionPanelMessages.authorizeFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(canvaConnectionPanelMessages.authorizeSucceeded));
      await queryClient.invalidateQueries({
        queryKey: ["canva-connections", organizationSlug],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(canvaConnectionPanelMessages.authorizeFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];
  const isConnected = connections.length > 0;
  const showForm = adding || connections.length === 0;
  const apiKeys = apiKeysQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

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
        name={intl.formatMessage(canvaConnectionPanelMessages.rowName)}
        description={intl.formatMessage(canvaConnectionPanelMessages.rowDescription)}
        icon={<IntegrationLogo src="/images/canva-logo.svg" />}
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
                      {intl.formatMessage(canvaConnectionPanelMessages.tokenPrefix, {
                        prefix: connection.connectionTokenPrefix,
                      })}
                    </p>
                    {connection.canvaBrandId ? (
                      <p className="text-xs text-muted-foreground">
                        {intl.formatMessage(canvaConnectionPanelMessages.brandBound, {
                          brandId: connection.canvaBrandId,
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {connection.enabled ? (
                      <Badge variant="secondary">
                        <FormattedMessage {...canvaConnectionPanelMessages.enabled} />
                      </Badge>
                    ) : null}
                    {claimId ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled || authorizeMutation.isPending}
                        onClick={() => authorizeMutation.mutate(connection.id)}
                      >
                        <FormattedMessage {...canvaConnectionPanelMessages.authorize} />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || regenerateMutation.isPending}
                      onClick={() => regenerateMutation.mutate(connection.id)}
                    >
                      <FormattedMessage {...canvaConnectionPanelMessages.regenerate} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={disabled || deleteMutation.isPending}
                      aria-label={intl.formatMessage(canvaConnectionPanelMessages.delete)}
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
                <FormattedMessage {...canvaConnectionPanelMessages.addConnection} />
              </Button>
            </div>
          ) : null}

          {showForm ? (
            <div className="grid gap-3">
              <Field>
                <FieldLabel>
                  <FormattedMessage {...canvaConnectionPanelMessages.displayNameLabel} />
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
                  <FormattedMessage {...canvaConnectionPanelMessages.apiKeyLabel} />
                </FieldLabel>
                <Select
                  value={form.apiKeyId}
                  disabled={disabled || saveMutation.isPending || apiKeys.length === 0}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setForm((current) => ({ ...current, apiKeyId: value }));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {apiKeys.map((apiKey) => (
                      <SelectItem key={apiKey.id} value={apiKey.id}>
                        {apiKey.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {apiKeys.length === 0 ? (
                    <FormattedMessage {...canvaConnectionPanelMessages.noEligibleApiKeys} />
                  ) : (
                    <FormattedMessage {...canvaConnectionPanelMessages.apiKeyHelp} />
                  )}
                </p>
              </Field>
              <Field>
                <FieldLabel>
                  <FormattedMessage {...canvaConnectionPanelMessages.projectLabel} />
                </FieldLabel>
                <Select
                  value={form.projectId}
                  disabled={disabled || saveMutation.isPending || projects.length === 0}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setForm((current) => ({ ...current, projectId: value }));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {projects.length === 0 ? (
                    <FormattedMessage {...canvaConnectionPanelMessages.noProjects} />
                  ) : (
                    <FormattedMessage {...canvaConnectionPanelMessages.projectHelp} />
                  )}
                </p>
              </Field>
              <Field>
                <FieldLabel>
                  <FormattedMessage {...canvaConnectionPanelMessages.sourceLocaleLabel} />
                </FieldLabel>
                <Input
                  value={form.sourceLocale}
                  disabled={disabled || saveMutation.isPending}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sourceLocale: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>
                  <FormattedMessage {...canvaConnectionPanelMessages.targetLocalesLabel} />
                </FieldLabel>
                <Input
                  value={form.targetLocales}
                  disabled={disabled || saveMutation.isPending}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, targetLocales: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage {...canvaConnectionPanelMessages.targetLocalesHelp} />
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
                    <FormattedMessage {...canvaConnectionPanelMessages.cancel} />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={disabled || saveMutation.isPending}
                  onClick={() => saveMutation.mutate(form)}
                >
                  <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />
                  <FormattedMessage {...canvaConnectionPanelMessages.save} />
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
              <FormattedMessage {...canvaConnectionPanelMessages.tokenDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...canvaConnectionPanelMessages.tokenDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <Input readOnly value={revealedToken ?? ""} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void handleCopyToken()}>
              <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={1.8} />
              {copied ? (
                <FormattedMessage {...canvaConnectionPanelMessages.copied} />
              ) : (
                <FormattedMessage {...canvaConnectionPanelMessages.copyToken} />
              )}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setRevealedToken(null);
                setCopied(false);
              }}
            >
              <FormattedMessage {...canvaConnectionPanelMessages.done} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

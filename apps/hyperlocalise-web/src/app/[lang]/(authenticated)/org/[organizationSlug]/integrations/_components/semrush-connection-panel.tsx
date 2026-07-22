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
import { siSemrush } from "simple-icons";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createApiClient } from "@/lib/api-client";
import type { SemrushConnectionSummary } from "@/lib/semrush/types";

import { SimpleBrandIcon } from "./simple-brand-icon";
import { semrushConnectionPanelMessages } from "./semrush-connection-panel.messages";

const api = createApiClient();

type SemrushConnectionForm = {
  displayName: string;
  apiKey: string;
};

const emptyForm = (): SemrushConnectionForm => ({
  displayName: "",
  apiKey: "",
});

export function useSemrushConnections(organizationSlug: string) {
  const intl = useIntl();

  return useQuery({
    queryKey: ["semrush-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["semrush-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(semrushConnectionPanelMessages.fetchFailed));
      }
      const body = await response.json();
      return body.semrushConnections as SemrushConnectionSummary[];
    },
  });
}

export function SemrushConnectionPanel({
  organizationSlug,
  disabled,
}: {
  organizationSlug: string;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const connectionsQuery = useSemrushConnections(organizationSlug);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SemrushConnectionForm>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async (payload: SemrushConnectionForm) => {
      const apiKey = payload.apiKey.trim();
      if (!apiKey) {
        throw new Error(intl.formatMessage(semrushConnectionPanelMessages.apiKeyRequired));
      }

      const response = await api.api.orgs[":organizationSlug"]["semrush-connections"].$post({
        param: { organizationSlug },
        json: {
          displayName: payload.displayName.trim() || "Semrush",
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
          body?.message || intl.formatMessage(semrushConnectionPanelMessages.saveFailed),
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(semrushConnectionPanelMessages.saveSucceeded));
      setAdding(false);
      setForm(emptyForm());
      await queryClient.invalidateQueries({ queryKey: ["semrush-connections", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(semrushConnectionPanelMessages.saveFailed),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await api.api.orgs[":organizationSlug"]["semrush-connections"][
        ":connectionId"
      ].$delete({
        param: { organizationSlug, connectionId },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        if (body?.error === "semrush_connection_in_use") {
          throw new Error(intl.formatMessage(semrushConnectionPanelMessages.deleteInUse));
        }
        throw new Error(
          body?.message || intl.formatMessage(semrushConnectionPanelMessages.deleteFailed),
        );
      }
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(semrushConnectionPanelMessages.deleteSucceeded));
      await queryClient.invalidateQueries({ queryKey: ["semrush-connections", organizationSlug] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(semrushConnectionPanelMessages.deleteFailed),
      );
    },
  });

  const connections = connectionsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SimpleBrandIcon icon={siSemrush} colored={false} className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              <FormattedMessage {...semrushConnectionPanelMessages.rowName} />
            </div>
            <p className="mt-1 text-xs text-pretty text-muted-foreground">
              <FormattedMessage {...semrushConnectionPanelMessages.rowDescription} />
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
        >
          <FormattedMessage {...semrushConnectionPanelMessages.addConnection} />
        </Button>
      </div>

      {connections.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...semrushConnectionPanelMessages.emptyState} />
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
                {intl.formatMessage(semrushConnectionPanelMessages.tokenConfigured, {
                  suffix: connection.maskedApiKeySuffix,
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {connection.enabled ? <Badge variant="secondary">Enabled</Badge> : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled || deleteMutation.isPending}
                aria-label={intl.formatMessage(semrushConnectionPanelMessages.delete)}
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
              <FormattedMessage {...semrushConnectionPanelMessages.displayNameLabel} />
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
              <FormattedMessage {...semrushConnectionPanelMessages.apiKeyLabel} />
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
              <FormattedMessage {...semrushConnectionPanelMessages.apiKeyHelp} />
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
              <FormattedMessage {...semrushConnectionPanelMessages.cancel} />
            </Button>
            <Button
              type="button"
              disabled={disabled || saveMutation.isPending}
              onClick={() => saveMutation.mutate(form)}
            >
              <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...semrushConnectionPanelMessages.save} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

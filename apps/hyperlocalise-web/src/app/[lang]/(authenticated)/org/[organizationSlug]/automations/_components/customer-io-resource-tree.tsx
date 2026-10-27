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
import { useQuery } from "@tanstack/react-query";
import {
  BellIcon,
  CaretRightIcon,
  ChatTextIcon,
  EnvelopeIcon,
  FolderIcon,
  MegaphoneIcon,
  NewspaperIcon,
  ReceiptIcon,
  RocketIcon,
} from "@phosphor-icons/react";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { cn } from "@/lib/primitives/cn";

export type CustomerIoTreeResourceKind = "broadcast" | "campaign" | "newsletter" | "transactional";

export type CustomerIoTreeSelection = Record<CustomerIoTreeResourceKind, string[]>;

type LibraryItem = { id: string; name: string };
type ActionItem = { id: string; name: string; type: string; language: string };

const TREE_ICON_CLASS = "size-4 shrink-0";

const GROUPS: Array<{
  kind: CustomerIoTreeResourceKind;
  label: string;
  endpoint: "broadcasts" | "campaigns" | "newsletters" | "transactional";
  responseKey: string;
  icon: typeof FolderIcon;
}> = [
  {
    kind: "broadcast",
    label: "Broadcasts",
    endpoint: "broadcasts",
    responseKey: "broadcasts",
    icon: MegaphoneIcon,
  },
  {
    kind: "campaign",
    label: "Campaigns",
    endpoint: "campaigns",
    responseKey: "campaigns",
    icon: RocketIcon,
  },
  {
    kind: "newsletter",
    label: "Newsletters",
    endpoint: "newsletters",
    responseKey: "newsletters",
    icon: NewspaperIcon,
  },
  {
    kind: "transactional",
    label: "Transactional",
    endpoint: "transactional",
    responseKey: "transactionalMessages",
    icon: ReceiptIcon,
  },
];

function withExtras(loaded: LibraryItem[], selectedIds: string[]): LibraryItem[] {
  const byId = new Set(loaded.map((item) => item.id));
  return [...loaded, ...selectedIds.filter((id) => !byId.has(id)).map((id) => ({ id, name: id }))];
}

export const CUSTOMER_IO_TREE_FIELDS: Record<
  CustomerIoTreeResourceKind,
  | "customerIoBroadcastIds"
  | "customerIoCampaignIds"
  | "customerIoNewsletterIds"
  | "customerIoTransactionalMessageIds"
> = {
  broadcast: "customerIoBroadcastIds",
  campaign: "customerIoCampaignIds",
  newsletter: "customerIoNewsletterIds",
  transactional: "customerIoTransactionalMessageIds",
};

export function toggleCustomerIoTreeSelection(
  form: WorkspaceAutomationFormState,
  kind: CustomerIoTreeResourceKind,
  id: string,
): WorkspaceAutomationFormState {
  const field = CUSTOMER_IO_TREE_FIELDS[kind];
  const ids = form[field];
  return {
    ...form,
    [field]: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
  };
}

function ActionTypeIcon({ type }: { type: string }) {
  const normalized = type.trim().toLowerCase();
  if (normalized === "email") {
    return <EnvelopeIcon className={cn(TREE_ICON_CLASS, "text-muted-foreground")} />;
  }
  if (normalized === "push") {
    return <BellIcon className={cn(TREE_ICON_CLASS, "text-muted-foreground")} />;
  }
  return <ChatTextIcon className={cn(TREE_ICON_CLASS, "text-muted-foreground")} />;
}

function CustomerIoTreeActions({
  organizationSlug,
  kind,
  resourceId,
}: {
  organizationSlug: string;
  kind: CustomerIoTreeResourceKind;
  resourceId: string;
}) {
  const actionsQuery = useQuery({
    queryKey: ["customer-io-actions", organizationSlug, kind, resourceId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["customer-io"].actions.$get({
        param: { organizationSlug },
        query: { kind, id: resourceId },
      });
      if (!response.ok) {
        throw new Error("Failed to load message actions.");
      }
      const body = await response.json();
      if (!("actions" in body) || !Array.isArray(body.actions)) {
        throw new Error("Failed to load message actions.");
      }
      return (body.actions as ActionItem[]).filter(
        (item) => typeof item.id === "string" && typeof item.type === "string",
      );
    },
  });

  if (actionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-1 pl-12 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Loading actions…
      </div>
    );
  }

  if (actionsQuery.isError) {
    return (
      <TypographyP size="small" tone="subtle" className="py-1 pl-12">
        Could not load message actions.
      </TypographyP>
    );
  }

  const actions = actionsQuery.data ?? [];
  if (actions.length === 0) {
    return (
      <TypographyP size="small" tone="subtle" className="py-1 pl-12">
        No localizable actions.
      </TypographyP>
    );
  }

  return (
    <>
      {actions.map((action) => (
        <div key={action.id} className="flex items-center gap-2 py-1 pl-12">
          <span className="inline-flex size-6 shrink-0" aria-hidden />
          <Checkbox checked={false} disabled aria-label={`${action.name} (details only)`} />
          <ActionTypeIcon type={action.type} />
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {action.name || action.id}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {action.type}
            {action.language.trim() ? ` · ${action.language}` : " · Default"}
          </span>
        </div>
      ))}
    </>
  );
}

function CustomerIoTreeGroup({
  organizationSlug,
  group,
  enabled,
  connected,
  selectedIds,
  disabled,
  onToggle,
}: {
  organizationSlug: string;
  group: (typeof GROUPS)[number];
  enabled: boolean;
  connected: boolean;
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState(false);
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());
  const libraryQuery = useQuery({
    queryKey: [`customer-io-${group.endpoint}`, organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["customer-io"][
        group.endpoint
      ].$get({
        param: { organizationSlug },
        query: {},
      });
      if (!response.ok) {
        throw new Error(`Failed to load ${group.label}.`);
      }
      const body = await response.json();
      const items = (body as Record<string, unknown>)[group.responseKey];
      if (!Array.isArray(items)) {
        throw new Error(`Failed to load ${group.label}.`);
      }
      return (items as LibraryItem[]).filter(
        (item) => typeof item.id === "string" && typeof item.name === "string",
      );
    },
  });

  const GroupIcon = group.icon;
  const resources = withExtras(libraryQuery.data ?? [], selectedIds);
  const selectedCount = resources.filter((item) => selectedIds.includes(item.id)).length;

  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
          onClick={() => setExpandedGroups((open) => !open)}
          aria-expanded={expandedGroups}
          aria-label={`${expandedGroups ? "Collapse" : "Expand"} ${group.label}`}
        >
          <CaretRightIcon
            className={cn("size-4 transition-transform", expandedGroups && "rotate-90")}
          />
        </button>
        <GroupIcon className={TREE_ICON_CLASS} weight="fill" />
        <span className="min-w-0 truncate text-sm font-medium">{group.label}</span>
        {libraryQuery.data ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount} selected` : `${resources.length}`}
          </span>
        ) : null}
      </div>
      {expandedGroups ? (
        <div className="pl-4">
          {libraryQuery.isLoading ? (
            <Skeleton className="ml-8 h-6 rounded" />
          ) : libraryQuery.isError ? (
            <TypographyP size="small" tone="subtle" className="py-1 pl-8">
              Could not load {group.label.toLowerCase()}.
            </TypographyP>
          ) : resources.length === 0 ? (
            <TypographyP size="small" tone="subtle" className="py-1 pl-8">
              None yet.
            </TypographyP>
          ) : (
            resources.map((resource) => {
              const checked = selectedIds.includes(resource.id);
              const expanded = expandedResources.has(resource.id);
              return (
                <div key={resource.id}>
                  <div className="flex items-center gap-2 py-1">
                    <button
                      type="button"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
                      onClick={() =>
                        setExpandedResources((keys) => {
                          const next = new Set(keys);
                          if (next.has(resource.id)) {
                            next.delete(resource.id);
                          } else {
                            next.add(resource.id);
                          }
                          return next;
                        })
                      }
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${resource.name}`}
                    >
                      <CaretRightIcon
                        className={cn("size-4 transition-transform", expanded && "rotate-90")}
                      />
                    </button>
                    <Checkbox
                      checked={checked}
                      disabled={disabled || !connected}
                      onCheckedChange={() => onToggle(resource.id)}
                      aria-label={`Select ${resource.name}`}
                    />
                    <FolderIcon className={cn(TREE_ICON_CLASS, "text-muted-foreground")} />
                    <span className="min-w-0 truncate text-sm">{resource.name}</span>
                  </div>
                  {expanded ? (
                    <CustomerIoTreeActions
                      organizationSlug={organizationSlug}
                      kind={group.kind}
                      resourceId={resource.id}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerIoResourceTree({
  organizationSlug,
  enabled,
  connected,
  selection,
  disabled,
  onToggle,
}: {
  organizationSlug: string;
  enabled: boolean;
  connected: boolean;
  selection: CustomerIoTreeSelection;
  disabled?: boolean;
  onToggle: (kind: CustomerIoTreeResourceKind, id: string) => void;
}) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border bg-canvas py-1">
      {GROUPS.map((group) => (
        <div key={group.kind} className="pl-4">
          <CustomerIoTreeGroup
            organizationSlug={organizationSlug}
            group={group}
            enabled={enabled}
            connected={connected}
            selectedIds={selection[group.kind]}
            disabled={disabled}
            onToggle={(id) => onToggle(group.kind, id)}
          />
        </div>
      ))}
    </div>
  );
}

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

export type CustomerIoTreeActionSelection = Record<
  CustomerIoTreeResourceKind,
  Record<string, string[]>
>;

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

export const CUSTOMER_IO_TREE_ACTION_FIELDS: Record<
  CustomerIoTreeResourceKind,
  | "customerIoBroadcastActions"
  | "customerIoCampaignActions"
  | "customerIoNewsletterActions"
  | "customerIoTransactionalMessageActions"
> = {
  broadcast: "customerIoBroadcastActions",
  campaign: "customerIoCampaignActions",
  newsletter: "customerIoNewsletterActions",
  transactional: "customerIoTransactionalMessageActions",
};
export function toggleCustomerIoTreeSelection(
  form: WorkspaceAutomationFormState,
  kind: CustomerIoTreeResourceKind,
  id: string,
): WorkspaceAutomationFormState {
  const field = CUSTOMER_IO_TREE_FIELDS[kind];
  const actionField = CUSTOMER_IO_TREE_ACTION_FIELDS[kind];
  const ids = form[field];
  if (ids.includes(id)) {
    const nextEntries = { ...form[actionField] };
    delete nextEntries[id];
    return {
      ...form,
      [field]: ids.filter((value) => value !== id),
      [actionField]: nextEntries,
    };
  }
  return {
    ...form,
    [field]: [...ids, id],
  };
}

export function isCustomerIoTreeActionSelected(
  form: WorkspaceAutomationFormState,
  kind: CustomerIoTreeResourceKind,
  resourceId: string,
  actionId: string,
): boolean {
  if (!form[CUSTOMER_IO_TREE_FIELDS[kind]].includes(resourceId)) {
    return false;
  }
  const entry = form[CUSTOMER_IO_TREE_ACTION_FIELDS[kind]][resourceId];
  return !entry || entry.includes(actionId);
}

export function toggleCustomerIoTreeActionSelection(
  form: WorkspaceAutomationFormState,
  kind: CustomerIoTreeResourceKind,
  resourceId: string,
  actionId: string,
  visibleActionIds: string[],
): WorkspaceAutomationFormState {
  const resourceField = CUSTOMER_IO_TREE_FIELDS[kind];
  const actionField = CUSTOMER_IO_TREE_ACTION_FIELDS[kind];
  const resources = form[resourceField];
  const entries = form[actionField];
  const entry = entries[resourceId];
  const selected = resources.includes(resourceId) && (!entry || entry.includes(actionId));
  if (selected) {
    const remaining = (entry ?? visibleActionIds).filter((id) => id !== actionId);
    if (remaining.length === 0) {
      const nextEntries = { ...entries };
      delete nextEntries[resourceId];
      return {
        ...form,
        [resourceField]: resources.filter((id) => id !== resourceId),
        [actionField]: nextEntries,
      };
    }
    return {
      ...form,
      [actionField]: { ...entries, [resourceId]: remaining },
    };
  }
  return {
    ...form,
    [resourceField]: resources.includes(resourceId) ? resources : [...resources, resourceId],
    [actionField]: { ...entries, [resourceId]: entry ? [...entry, actionId] : [actionId] },
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
  resourceSelected,
  selectedActionIds,
  disabled,
  onToggle,
}: {
  organizationSlug: string;
  kind: CustomerIoTreeResourceKind;
  resourceId: string;
  resourceSelected: boolean;
  selectedActionIds: string[] | undefined;
  disabled: boolean;
  onToggle: (actionId: string, visibleActionIds: string[]) => void;
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
  // Only default-language actions are selectable: import/push skip translated
  // variants, so showing them as tickable rows would be misleading.
  const sourceActions = actions.filter(
    (action) => typeof action.language !== "string" || action.language.trim() === "",
  );
  const hiddenTranslations = actions.length - sourceActions.length;
  if (sourceActions.length === 0) {
    return (
      <TypographyP size="small" tone="subtle" className="py-1 pl-12">
        No localizable actions. Selecting this item will not import any file until a
        default-language email, push, SMS, Slack, or Twilio action exists.
      </TypographyP>
    );
  }

  return (
    <>
      {sourceActions.map((action) => (
        <div key={action.id} className="flex items-center gap-2 py-1 pl-12">
          <span className="inline-flex size-6 shrink-0" aria-hidden />
          <Checkbox
            checked={
              resourceSelected && (!selectedActionIds || selectedActionIds.includes(action.id))
            }
            disabled={disabled}
            onCheckedChange={() =>
              onToggle(
                action.id,
                sourceActions.map((item) => item.id),
              )
            }
            aria-label={`Select ${action.name || action.id}`}
          />
          <ActionTypeIcon type={action.type} />
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {action.name || action.id}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{action.type} · Default</span>
        </div>
      ))}
      {hiddenTranslations > 0 ? (
        <TypographyP size="small" tone="subtle" className="py-1 pl-12">
          {hiddenTranslations} translated {hiddenTranslations === 1 ? "variant" : "variants"}{" "}
          hidden.
        </TypographyP>
      ) : null}
    </>
  );
}

function CustomerIoTreeGroup({
  organizationSlug,
  group,
  enabled,
  connected,
  selectedIds,
  actionSelection,
  disabled,
  onToggle,
  onToggleAction,
}: {
  organizationSlug: string;
  group: (typeof GROUPS)[number];
  enabled: boolean;
  connected: boolean;
  selectedIds: string[];
  actionSelection: Record<string, string[]>;
  disabled?: boolean;
  onToggle: (id: string) => void;
  onToggleAction: (resourceId: string, actionId: string, visibleActionIds: string[]) => void;
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
      return (items as Array<{ id?: unknown; name?: unknown }>).flatMap((item) => {
        const id =
          typeof item.id === "number"
            ? String(item.id)
            : typeof item.id === "string"
              ? item.id
              : "";
        if (!id) {
          return [];
        }
        const rawName = typeof item.name === "string" ? item.name.trim() : "";
        return [{ id, name: rawName || id }];
      });
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
                      resourceSelected={checked}
                      selectedActionIds={actionSelection[resource.id]}
                      disabled={disabled || !connected}
                      onToggle={(actionId, visibleActionIds) =>
                        onToggleAction(resource.id, actionId, visibleActionIds)
                      }
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
  actionSelection,
  disabled,
  onToggle,
  onToggleAction,
}: {
  organizationSlug: string;
  enabled: boolean;
  connected: boolean;
  selection: CustomerIoTreeSelection;
  actionSelection: CustomerIoTreeActionSelection;
  disabled?: boolean;
  onToggle: (kind: CustomerIoTreeResourceKind, id: string) => void;
  onToggleAction: (
    kind: CustomerIoTreeResourceKind,
    resourceId: string,
    actionId: string,
    visibleActionIds: string[],
  ) => void;
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
            actionSelection={actionSelection[group.kind]}
            disabled={disabled}
            onToggle={(id) => onToggle(group.kind, id)}
            onToggleAction={(resourceId, actionId, visibleActionIds) =>
              onToggleAction(group.kind, resourceId, actionId, visibleActionIds)
            }
          />
        </div>
      ))}
    </div>
  );
}

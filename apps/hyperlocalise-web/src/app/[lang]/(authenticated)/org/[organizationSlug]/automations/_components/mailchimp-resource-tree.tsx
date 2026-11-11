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
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CaretRightIcon, FileIcon, FolderIcon } from "@phosphor-icons/react";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import type {
  MailchimpLibrary,
  MailchimpLibraryItem,
  MailchimpLibraryUnsupportedItem,
} from "@/lib/mailchimp/list-library";
import { cn } from "@/lib/primitives/cn";

export type MailchimpResourceKind = "campaign" | "template";

export type MailchimpTreeSelection = Record<MailchimpResourceKind, string[]>;

const TREE_ICON_CLASS = "size-4 shrink-0";

const GROUPS: Array<{
  kind: MailchimpResourceKind;
  label: string;
  itemsKey: keyof Omit<MailchimpLibrary, "warnings" | "unsupportedTemplates">;
}> = [
  { kind: "campaign", label: "Campaigns", itemsKey: "campaigns" },
  { kind: "template", label: "Templates", itemsKey: "templates" },
];

export const MAILCHIMP_TREE_FIELDS: Record<
  MailchimpResourceKind,
  "mailchimpCampaignIds" | "mailchimpTemplateIds"
> = {
  campaign: "mailchimpCampaignIds",
  template: "mailchimpTemplateIds",
};

function withExtras(
  loaded: MailchimpLibraryItem[],
  selectedIds: string[],
  skipIds: ReadonlySet<string>,
): MailchimpLibraryItem[] {
  const byId = new Set(loaded.map((item) => item.id));
  return [
    ...loaded,
    ...selectedIds
      .filter((id) => !byId.has(id) && !skipIds.has(id))
      .map((id) => ({ id, name: id })),
  ];
}

export function pruneMailchimpTreeSelection(
  form: WorkspaceAutomationFormState,
  kind: MailchimpResourceKind,
  idsToRemove: readonly string[],
): WorkspaceAutomationFormState {
  const field = MAILCHIMP_TREE_FIELDS[kind];
  const remove = new Set(idsToRemove);
  const nextIds = form[field].filter((id) => !remove.has(id));
  if (nextIds.length === form[field].length) {
    return form;
  }
  return { ...form, [field]: nextIds };
}

export function toggleMailchimpTreeSelection(
  form: WorkspaceAutomationFormState,
  kind: MailchimpResourceKind,
  id: string,
): WorkspaceAutomationFormState {
  const field = MAILCHIMP_TREE_FIELDS[kind];
  const ids = form[field];
  return {
    ...form,
    [field]: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
  };
}

function MailchimpTreeGroup({
  group,
  items,
  unsupportedItems,
  connected,
  selectedIds,
  disabled,
  onToggle,
}: {
  group: (typeof GROUPS)[number];
  items: MailchimpLibraryItem[];
  unsupportedItems?: MailchimpLibraryUnsupportedItem[];
  connected: boolean;
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const unsupportedIds = new Set((unsupportedItems ?? []).map((item) => item.id));
  const visible = withExtras(items, selectedIds, unsupportedIds);
  const rowCount = items.length + (unsupportedItems?.length ?? 0);

  return (
    <div className="py-1">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm font-medium hover:bg-muted/50"
        onClick={() => setOpen((value) => !value)}
        disabled={!connected}
      >
        <CaretRightIcon className={cn(TREE_ICON_CLASS, open ? "rotate-90" : "")} />
        <FolderIcon className={cn(TREE_ICON_CLASS, "text-muted-foreground")} />
        <span>{group.label}</span>
        <span className="text-muted-foreground">({rowCount})</span>
      </button>
      {open ? (
        <div className="ml-6 border-l pl-2">
          {visible.length === 0 && rowCount === 0 ? (
            <TypographyP size="small" tone="subtle" className="px-2 py-1">
              No importable {group.label.toLowerCase()} found.
            </TypographyP>
          ) : (
            visible.map((resource) => {
              const checked = selectedIds.includes(resource.id);
              return (
                <div key={resource.id} className="flex items-center gap-2 px-2 py-1">
                  <Checkbox
                    checked={checked}
                    disabled={disabled || !connected}
                    onCheckedChange={() => onToggle(resource.id)}
                    aria-label={resource.name}
                  />
                  <FileIcon className={cn(TREE_ICON_CLASS, "text-muted-foreground")} />
                  <span className="min-w-0 truncate text-sm">{resource.name}</span>
                </div>
              );
            })
          )}
          {(unsupportedItems ?? []).map((resource) => (
            <div
              key={resource.id}
              className="flex items-start gap-2 px-2 py-1 text-muted-foreground"
              title={resource.reason}
            >
              <Checkbox checked={false} disabled aria-label={resource.name} />
              <FileIcon className={cn(TREE_ICON_CLASS, "opacity-50")} />
              <span className="min-w-0 text-sm">
                <span className="block truncate">{resource.name}</span>
                <span className="block text-xs leading-snug">Drag-and-drop</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MailchimpResourceTree({
  organizationSlug,
  enabled,
  connected,
  selection,
  disabled,
  onToggle,
  onPruneSelection,
}: {
  organizationSlug: string;
  enabled: boolean;
  connected: boolean;
  selection: MailchimpTreeSelection;
  disabled?: boolean;
  onToggle: (kind: MailchimpResourceKind, id: string) => void;
  onPruneSelection?: (kind: MailchimpResourceKind, ids: string[]) => void;
}) {
  const libraryQuery = useQuery({
    queryKey: ["mailchimp-library", organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].mailchimp.library.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Mailchimp content.");
      }
      const body = await response.json();
      if (!("library" in body)) {
        throw new Error("Failed to load Mailchimp content.");
      }
      return body.library as MailchimpLibrary;
    },
  });

  useEffect(() => {
    const loaded = libraryQuery.data;
    if (!loaded || !onPruneSelection) {
      return;
    }
    const unsupportedTemplateIds = loaded.unsupportedTemplates.map((item) => item.id);
    const stale = selection.template.filter((id) => unsupportedTemplateIds.includes(id));
    if (stale.length > 0) {
      onPruneSelection("template", stale);
    }
  }, [libraryQuery.data, onPruneSelection, selection.template]);

  if (!connected) {
    return (
      <TypographyP size="small" tone="subtle">
        Connect Mailchimp in Integrations before choosing content.
      </TypographyP>
    );
  }

  if (libraryQuery.isLoading) {
    return <Skeleton className="h-40 rounded-lg" />;
  }

  if (libraryQuery.isError || !libraryQuery.data) {
    return (
      <TypographyP size="small" tone="subtle">
        Could not load Mailchimp content.
      </TypographyP>
    );
  }

  const library = libraryQuery.data;

  return (
    <div className="space-y-2">
      <div className="max-h-72 overflow-y-auto rounded-lg border bg-canvas py-1">
        {GROUPS.map((group) => (
          <div key={group.kind} className="pl-4">
            <MailchimpTreeGroup
              group={group}
              items={library[group.itemsKey]}
              unsupportedItems={
                group.kind === "template" ? library.unsupportedTemplates : undefined
              }
              connected={connected}
              selectedIds={selection[group.kind]}
              disabled={disabled}
              onToggle={(id) => onToggle(group.kind, id)}
            />
          </div>
        ))}
      </div>
      {library.warnings.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {library.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

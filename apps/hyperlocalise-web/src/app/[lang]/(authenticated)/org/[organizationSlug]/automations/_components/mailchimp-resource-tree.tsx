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
import { useState } from "react";
import { CaretRightIcon, FileIcon, FolderIcon } from "@phosphor-icons/react";

import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import type { MailchimpLibrary, MailchimpLibraryItem } from "@/lib/mailchimp/list-library";
import { cn } from "@/lib/primitives/cn";

export type MailchimpResourceKind = "campaign" | "template";

export type MailchimpTreeSelection = Record<MailchimpResourceKind, string[]>;

const TREE_ICON_CLASS = "size-4 shrink-0";

const GROUPS: Array<{
  kind: MailchimpResourceKind;
  label: string;
  itemsKey: keyof Omit<MailchimpLibrary, "warnings">;
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

function withExtras(loaded: MailchimpLibraryItem[], selectedIds: string[]): MailchimpLibraryItem[] {
  const byId = new Set(loaded.map((item) => item.id));
  return [...loaded, ...selectedIds.filter((id) => !byId.has(id)).map((id) => ({ id, name: id }))];
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
  connected,
  selectedIds,
  disabled,
  onToggle,
}: {
  group: (typeof GROUPS)[number];
  items: MailchimpLibraryItem[];
  connected: boolean;
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const visible = withExtras(items, selectedIds);

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
        <span className="text-muted-foreground">({visible.length})</span>
      </button>
      {open ? (
        <div className="ml-6 border-l pl-2">
          {visible.length === 0 ? (
            <TypographyP size="small" tone="subtle" className="px-2 py-1">
              No {group.label.toLowerCase()} found.
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
}: {
  organizationSlug: string;
  enabled: boolean;
  connected: boolean;
  selection: MailchimpTreeSelection;
  disabled?: boolean;
  onToggle: (kind: MailchimpResourceKind, id: string) => void;
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
    <div className="max-h-72 overflow-y-auto rounded-lg border bg-canvas py-1">
      {GROUPS.map((group) => (
        <div key={group.kind} className="pl-4">
          <MailchimpTreeGroup
            group={group}
            items={library[group.itemsKey]}
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

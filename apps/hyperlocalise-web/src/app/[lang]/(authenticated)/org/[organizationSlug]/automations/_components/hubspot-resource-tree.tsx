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
import type { HubspotResourceKind } from "@/lib/hubspot/constants";
import type { HubspotLibrary, HubspotLibraryItem } from "@/lib/hubspot/list-library";
import { cn } from "@/lib/primitives/cn";

export type HubspotTreeSelection = Record<HubspotResourceKind, string[]>;

const TREE_ICON_CLASS = "size-4 shrink-0";

const GROUPS: Array<{
  kind: HubspotResourceKind;
  label: string;
  itemsKey: keyof Omit<HubspotLibrary, "warnings">;
}> = [{ kind: "email", label: "Emails", itemsKey: "emails" }];

export const HUBSPOT_TREE_FIELDS: Record<
  HubspotResourceKind,
  | "hubspotEmailIds"
  | "hubspotFormIds"
  | "hubspotBlogPostIds"
  | "hubspotLandingPageIds"
  | "hubspotWebsitePageIds"
  | "hubspotMessageTemplateIds"
> = {
  email: "hubspotEmailIds",
  form: "hubspotFormIds",
  blog: "hubspotBlogPostIds",
  "landing-page": "hubspotLandingPageIds",
  "website-page": "hubspotWebsitePageIds",
  "message-template": "hubspotMessageTemplateIds",
};

function withExtras(loaded: HubspotLibraryItem[], selectedIds: string[]): HubspotLibraryItem[] {
  const byId = new Set(loaded.map((item) => item.id));
  return [...loaded, ...selectedIds.filter((id) => !byId.has(id)).map((id) => ({ id, name: id }))];
}

export function toggleHubspotTreeSelection(
  form: WorkspaceAutomationFormState,
  kind: HubspotResourceKind,
  id: string,
): WorkspaceAutomationFormState {
  const field = HUBSPOT_TREE_FIELDS[kind];
  const ids = form[field];
  return {
    ...form,
    [field]: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
  };
}

function HubspotTreeGroup({
  group,
  items,
  connected,
  selectedIds,
  disabled,
  onToggle,
}: {
  group: (typeof GROUPS)[number];
  items: HubspotLibraryItem[];
  connected: boolean;
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const resources = withExtras(items, selectedIds);
  const selectedCount = resources.filter((item) => selectedIds.includes(item.id)).length;

  return (
    <div>
      <div className="flex items-center gap-2 py-1">
        <button
          type="button"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
        >
          <CaretRightIcon className={cn("size-4 transition-transform", expanded && "rotate-90")} />
        </button>
        <FolderIcon className={TREE_ICON_CLASS} weight="fill" />
        <span className="min-w-0 truncate text-sm font-medium">{group.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {selectedCount > 0 ? `${selectedCount} selected` : `${resources.length}`}
        </span>
      </div>
      {expanded ? (
        <div className="pl-4">
          {resources.length === 0 ? (
            <TypographyP size="small" tone="subtle" className="py-1 pl-8">
              None yet.
            </TypographyP>
          ) : (
            resources.map((resource) => {
              const checked = selectedIds.includes(resource.id);
              return (
                <div key={resource.id} className="flex items-center gap-2 py-1 pl-8">
                  <Checkbox
                    checked={checked}
                    disabled={disabled || !connected}
                    onCheckedChange={() => onToggle(resource.id)}
                    aria-label={`Select ${resource.name}`}
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

export function HubspotResourceTree({
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
  selection: HubspotTreeSelection;
  disabled?: boolean;
  onToggle: (kind: HubspotResourceKind, id: string) => void;
}) {
  const libraryQuery = useQuery({
    queryKey: ["hubspot-library", organizationSlug],
    enabled,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].hubspot.library.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load HubSpot content.");
      }
      const body = await response.json();
      if (!("library" in body)) {
        throw new Error("Failed to load HubSpot content.");
      }
      return body.library;
    },
  });

  if (!connected) {
    return (
      <TypographyP size="small" tone="subtle">
        Connect HubSpot in Integrations before choosing content.
      </TypographyP>
    );
  }

  if (libraryQuery.isLoading) {
    return <Skeleton className="h-40 rounded-lg" />;
  }

  if (libraryQuery.isError || !libraryQuery.data) {
    return (
      <TypographyP size="small" tone="subtle">
        Could not load HubSpot content.
      </TypographyP>
    );
  }

  const library = libraryQuery.data;

  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border bg-canvas py-1">
      {GROUPS.map((group) => (
        <div key={group.kind} className="pl-4">
          <HubspotTreeGroup
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

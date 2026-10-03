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
import type { ReactNode } from "react";
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { isLiveProviderMemoryId } from "@/lib/providers/jobs/tms-provider-resource-id";

import type { WorkspaceGroupedTableColumn } from "../../_components/workspace-grouped-table";
import type { MemoryListRow } from "./memory-list";
import { translationMemoriesTableMessages } from "./translation-memories-table.messages";

export type TranslationMemoriesTableQuery = {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  refetch?: () => void;
};

export function useTranslationMemoriesTableColumns(): WorkspaceGroupedTableColumn[] {
  const intl = useIntl();

  return [
    {
      id: "name",
      label: intl.formatMessage(translationMemoriesTableMessages.nameColumn),
    },
    {
      id: "segments",
      label: intl.formatMessage(translationMemoriesTableMessages.segmentsColumn),
      className: "w-36",
    },
    {
      id: "languages",
      label: intl.formatMessage(translationMemoriesTableMessages.languagesColumn),
      className: "w-56",
    },
    {
      id: "projects",
      label: intl.formatMessage(translationMemoriesTableMessages.projectsColumn),
      className: "w-48",
    },
  ];
}

export function renderMemoryTableCells(
  memory: MemoryListRow,
  organizationSlug: string,
  intl: ReturnType<typeof useIntl>,
): ReactNode[] {
  const isLive = isLiveProviderMemoryId(memory.id);
  const projects =
    memory.source === "native"
      ? intl.formatMessage(translationMemoriesTableMessages.allProjects)
      : memory.externalProjectId
        ? intl.formatMessage(translationMemoriesTableMessages.projectId, {
            projectId: memory.externalProjectId,
          })
        : "—";
  const name = isLive ? (
    <span className="truncate font-medium text-foreground">{memory.name}</span>
  ) : (
    <OrgNavLink
      href={`/org/${organizationSlug}/translation-memories/${memory.id}`}
      prefetch
      className="truncate font-medium text-foreground underline-offset-2 hover:underline"
    >
      {memory.name}
    </OrgNavLink>
  );

  return [
    name,
    <span key="segments" className="tabular-nums">
      {memory.segmentCountLabel}
    </span>,
    <span key="languages" className="block truncate" title={memory.localeSummary}>
      {memory.localeSummary || "—"}
    </span>,
    <span key="projects" className="block truncate" title={projects}>
      {projects}
    </span>,
  ];
}

export function TranslationMemoriesEmptyAction({
  organizationSlug,
  label,
}: {
  organizationSlug: string;
  label?: string;
}) {
  return (
    <Button
      nativeButton={false}
      render={<OrgNavLink href={`/org/${organizationSlug}/integrations`} />}
      variant="outline"
      size="sm"
    >
      {label ?? <FormattedMessage {...translationMemoriesTableMessages.connectProvider} />}
    </Button>
  );
}

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
import type { WorkspaceGroupedTableColumn } from "../../_components/workspace-grouped-table";
import type { GlossaryListRow } from "./glossary-list";
import { glossariesTableMessages } from "./glossaries-table.messages";

export type GlossariesTableQuery = {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  refetch?: () => void;
};

export function useGlossariesTableColumns(): WorkspaceGroupedTableColumn[] {
  const intl = useIntl();

  return [
    {
      id: "name",
      label: intl.formatMessage(glossariesTableMessages.nameColumn),
    },
    {
      id: "terms",
      label: intl.formatMessage(glossariesTableMessages.termsLabel),
      className: "w-28",
    },
    {
      id: "languages",
      label: intl.formatMessage(glossariesTableMessages.languagesLabel),
      className: "w-56",
    },
    {
      id: "projects",
      label: intl.formatMessage(glossariesTableMessages.projectsColumn),
      className: "w-48",
    },
  ];
}

export function renderGlossaryTableCells(
  glossary: GlossaryListRow,
  organizationSlug: string,
  intl: ReturnType<typeof useIntl>,
): ReactNode[] {
  const languages = [glossary.sourceLocaleLabel, glossary.secondaryLocaleSummary]
    .filter(Boolean)
    .join(", ");
  const projects =
    glossary.source === "native"
      ? intl.formatMessage(glossariesTableMessages.usedInProjects, {
          count: glossary.projectCount ?? 0,
        })
      : (glossary.externalProjectName ??
        (glossary.externalProjectId
          ? intl.formatMessage(glossariesTableMessages.projectId, {
              projectId: glossary.externalProjectId,
            })
          : "—"));
  const nameClassName = "truncate font-medium text-foreground underline-offset-2 hover:underline";
  const name = glossary.detailId ? (
    <OrgNavLink
      href={`/org/${organizationSlug}/glossaries/${glossary.detailId}`}
      prefetch
      className={nameClassName}
    >
      {glossary.name}
    </OrgNavLink>
  ) : glossary.externalUrl ? (
    <a href={glossary.externalUrl} target="_blank" rel="noreferrer" className={nameClassName}>
      {glossary.name}
    </a>
  ) : (
    <span className="truncate font-medium text-foreground">{glossary.name}</span>
  );

  return [
    name,
    <span key="terms" className="tabular-nums">
      {glossary.termCountLabel}
    </span>,
    <span key="languages" className="block truncate" title={languages}>
      {languages || "—"}
    </span>,
    glossary.projectLinkId ? (
      <OrgNavLink
        key="projects"
        href={`/org/${organizationSlug}/projects/${glossary.projectLinkId}`}
        prefetch
        className="block truncate underline-offset-2 hover:text-foreground hover:underline"
        title={projects}
      >
        {projects}
      </OrgNavLink>
    ) : (
      <span key="projects" className="block truncate" title={projects}>
        {projects}
      </span>
    ),
  ];
}

export function GlossariesEmptyAction({
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
      {label ?? <FormattedMessage {...glossariesTableMessages.connectProvider} />}
    </Button>
  );
}

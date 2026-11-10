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
import Link from "next/link";

import { buildOrganizationPath, buildProjectPath } from "@/components/app-shell/navigation-config";
import { Button } from "@/components/ui/button";

import { GuidelineDocumentsSection } from "./guideline-documents-section";
import { KnowledgePageHeader } from "./knowledge-page-view";
import { KnowledgeProjectsSection } from "./knowledge-projects-section";

export function KnowledgePageContent({
  organizationSlug,
  projectId,
  canUpdateKnowledgeMemory,
}: {
  organizationSlug: string;
  projectId?: string;
  canUpdateKnowledgeMemory: boolean;
}) {
  const uploadHref = projectId
    ? buildProjectPath(organizationSlug, projectId, "knowledge/upload")
    : buildOrganizationPath(organizationSlug, "knowledge/upload");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <KnowledgePageHeader addSourcesHref={canUpdateKnowledgeMemory ? uploadHref : undefined} />
        {!projectId ? (
          <Button
            type="button"
            nativeButton={false}
            variant="outline"
            size="sm"
            render={
              <Link href={buildOrganizationPath(organizationSlug, "knowledge/assignments")} />
            }
          >
            Assign to projects
          </Button>
        ) : null}
      </div>

      <GuidelineDocumentsSection
        organizationSlug={organizationSlug}
        projectId={projectId}
        canUpdate={canUpdateKnowledgeMemory}
      />

      {!projectId ? <KnowledgeProjectsSection organizationSlug={organizationSlug} /> : null}
    </div>
  );
}

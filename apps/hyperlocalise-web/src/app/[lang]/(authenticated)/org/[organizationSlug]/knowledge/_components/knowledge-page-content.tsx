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
import { buildOrganizationPath } from "@/components/app-shell/navigation-config";
import { GuidelineDocumentsSection } from "./guideline-documents-section";
import { KnowledgePageHeader } from "./knowledge-page-view";

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
    ? `${buildOrganizationPath(organizationSlug, "knowledge/upload")}?project=${encodeURIComponent(projectId)}`
    : buildOrganizationPath(organizationSlug, "knowledge/upload");
  // Project-scoped guidelines are retired; project pages are readonly and
  // creation flows through the org upload page with the project preselected.
  // Writers still get the upload link; only the document list is readonly.
  const canUpdate = projectId ? false : canUpdateKnowledgeMemory;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <KnowledgePageHeader addSourcesHref={canUpdateKnowledgeMemory ? uploadHref : undefined} />

      <GuidelineDocumentsSection
        organizationSlug={organizationSlug}
        projectId={projectId}
        canUpdate={canUpdate}
      />
    </div>
  );
}

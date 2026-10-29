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
import { IntegrationLogo } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/integration-logo";
import type { ContentEditorPageNavigationGuardRef } from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { isLoopsSourcePath } from "@/lib/loops/source-path";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorIngestButton } from "./content-editor-ingest-button";
import {
  contentEditorLoopsIngestQueryKey,
  contentEditorLoopsPushQueryKey,
  fetchContentEditorLoopsIngestCandidates,
} from "./content-editor-loops-push-queries";

export function ContentEditorLoopsIngestButton({
  organizationSlug,
  projectId,
  canManageAutomations,
  sourcePath = null,
  pageNavigationGuardRef,
}: {
  organizationSlug: string;
  projectId: string;
  canManageAutomations: boolean;
  sourcePath?: string | null;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
}) {
  const openSourcePath = isContentEditorAllFilesSourcePath(sourcePath) ? null : sourcePath;
  const matchesFile = Boolean(openSourcePath && isLoopsSourcePath(openSourcePath));
  return (
    <ContentEditorIngestButton
      organizationSlug={organizationSlug}
      projectId={projectId}
      canManageAutomations={canManageAutomations && matchesFile}
      queryKey={contentEditorLoopsIngestQueryKey(organizationSlug, projectId, openSourcePath)}
      fetchCandidates={() =>
        fetchContentEditorLoopsIngestCandidates({
          organizationSlug,
          projectId,
          sourcePath: openSourcePath,
        })
      }
      invalidateKeys={[
        contentEditorLoopsIngestQueryKey(organizationSlug, projectId),
        contentEditorLoopsPushQueryKey(organizationSlug, projectId),
      ]}
      icon={<IntegrationLogo src="/images/loops-logo.png" className="size-4" />}
      pageNavigationGuardRef={pageNavigationGuardRef}
    />
  );
}

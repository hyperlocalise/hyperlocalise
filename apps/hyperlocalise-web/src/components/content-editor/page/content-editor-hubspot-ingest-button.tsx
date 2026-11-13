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
import { isHubspotSourcePath } from "@/lib/hubspot/source-path";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorIngestButton } from "./content-editor-ingest-button";
import {
  contentEditorHubspotIngestQueryKey,
  contentEditorHubspotPushQueryKey,
  fetchContentEditorHubspotIngestCandidates,
} from "./content-editor-hubspot-push-queries";

export function ContentEditorHubspotIngestButton({
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
  const matchesFile = Boolean(openSourcePath && isHubspotSourcePath(openSourcePath));
  return (
    <ContentEditorIngestButton
      organizationSlug={organizationSlug}
      projectId={projectId}
      canManageAutomations={canManageAutomations && matchesFile}
      queryKey={contentEditorHubspotIngestQueryKey(organizationSlug, projectId, openSourcePath)}
      fetchCandidates={() =>
        fetchContentEditorHubspotIngestCandidates({
          organizationSlug,
          projectId,
          sourcePath: openSourcePath,
        })
      }
      invalidateKeys={[
        contentEditorHubspotIngestQueryKey(organizationSlug, projectId),
        contentEditorHubspotPushQueryKey(organizationSlug, projectId),
      ]}
      icon={<IntegrationLogo src="/images/hubspot-logo.svg" className="size-4" />}
      pageNavigationGuardRef={pageNavigationGuardRef}
    />
  );
}

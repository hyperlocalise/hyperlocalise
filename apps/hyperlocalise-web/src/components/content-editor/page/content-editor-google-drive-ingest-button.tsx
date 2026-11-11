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
import { siGoogledrive } from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import type { ContentEditorPageNavigationGuardRef } from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import { isGoogleDriveSourcePath } from "@/lib/google-drive/constants";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorIngestButton } from "./content-editor-ingest-button";
import {
  contentEditorGoogleDriveIngestQueryKey,
  contentEditorGoogleDrivePushQueryKey,
  fetchContentEditorGoogleDriveIngestCandidates,
} from "./content-editor-google-drive-push-queries";

export function ContentEditorGoogleDriveIngestButton({
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
  const matchesFile = Boolean(openSourcePath && isGoogleDriveSourcePath(openSourcePath));
  return (
    <ContentEditorIngestButton
      organizationSlug={organizationSlug}
      projectId={projectId}
      canManageAutomations={canManageAutomations && matchesFile}
      queryKey={contentEditorGoogleDriveIngestQueryKey(organizationSlug, projectId, openSourcePath)}
      fetchCandidates={() =>
        fetchContentEditorGoogleDriveIngestCandidates({
          organizationSlug,
          projectId,
          sourcePath: openSourcePath,
        })
      }
      invalidateKeys={[
        contentEditorGoogleDriveIngestQueryKey(organizationSlug, projectId),
        contentEditorGoogleDrivePushQueryKey(organizationSlug, projectId),
      ]}
      icon={
        <SimpleBrandIcon
          icon={siGoogledrive}
          colored={false}
          className="size-4"
          data-icon="inline-start"
          opacity={1}
        />
      }
      pageNavigationGuardRef={pageNavigationGuardRef}
    />
  );
}

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
import { isMailchimpSourcePath } from "@/lib/mailchimp/html-envelope";
import { isContentEditorAllFilesSourcePath } from "@/lib/projects/content-editor-all-files";

import { ContentEditorIngestButton } from "./content-editor-ingest-button";
import {
  contentEditorMailchimpIngestQueryKey,
  contentEditorMailchimpPushQueryKey,
  fetchContentEditorMailchimpIngestCandidates,
} from "./content-editor-mailchimp-push-queries";

export function ContentEditorMailchimpIngestButton({
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
  const matchesFile = Boolean(openSourcePath && isMailchimpSourcePath(openSourcePath));
  return (
    <ContentEditorIngestButton
      organizationSlug={organizationSlug}
      projectId={projectId}
      canManageAutomations={canManageAutomations && matchesFile}
      queryKey={contentEditorMailchimpIngestQueryKey(organizationSlug, projectId, openSourcePath)}
      fetchCandidates={() =>
        fetchContentEditorMailchimpIngestCandidates({
          organizationSlug,
          projectId,
          sourcePath: openSourcePath,
        })
      }
      invalidateKeys={[
        contentEditorMailchimpIngestQueryKey(organizationSlug, projectId),
        contentEditorMailchimpPushQueryKey(organizationSlug, projectId),
      ]}
      icon={<IntegrationLogo src="/images/mailchimp-logo.png" className="size-4" />}
      pageNavigationGuardRef={pageNavigationGuardRef}
    />
  );
}

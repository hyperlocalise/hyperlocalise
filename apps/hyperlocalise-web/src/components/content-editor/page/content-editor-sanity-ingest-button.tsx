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
import { siSanity } from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import type { ContentEditorPageNavigationGuardRef } from "@/components/content-editor/workspace/content-editor-page-navigation-guard";

import { ContentEditorIngestButton } from "./content-editor-ingest-button";
import {
  contentEditorSanityIngestQueryKey,
  contentEditorSanityPushQueryKey,
  fetchContentEditorSanityIngestCandidates,
} from "./content-editor-sanity-push-queries";

export function ContentEditorSanityIngestButton({
  organizationSlug,
  projectId,
  canManageAutomations,
  pageNavigationGuardRef,
}: {
  organizationSlug: string;
  projectId: string;
  canManageAutomations: boolean;
  pageNavigationGuardRef?: ContentEditorPageNavigationGuardRef;
}) {
  return (
    <ContentEditorIngestButton
      organizationSlug={organizationSlug}
      projectId={projectId}
      canManageAutomations={canManageAutomations}
      queryKey={contentEditorSanityIngestQueryKey(organizationSlug, projectId)}
      fetchCandidates={() =>
        fetchContentEditorSanityIngestCandidates({
          organizationSlug,
          projectId,
        })
      }
      invalidateKeys={[
        contentEditorSanityIngestQueryKey(organizationSlug, projectId),
        contentEditorSanityPushQueryKey(organizationSlug, projectId),
      ]}
      icon={
        <SimpleBrandIcon
          icon={siSanity}
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

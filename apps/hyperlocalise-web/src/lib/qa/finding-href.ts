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
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";

export function buildTranslationQaFindingHref(input: {
  organizationSlug: string;
  projectId: string;
  sourcePath?: string | null;
  targetLocale: string;
  key: string;
}) {
  const params = new URLSearchParams({
    sourcePath: input.sourcePath?.trim() || CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
    locale: input.targetLocale,
    segment: input.key,
  });

  return `/org/${input.organizationSlug}/projects/${encodeURIComponent(input.projectId)}/files/content-editor?${params.toString()}`;
}

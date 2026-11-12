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
import { sql } from "drizzle-orm";

import { db } from "@/lib/database/client";
import { formatMemberDisplayName } from "@/lib/members/member-management";
import { DEFAULT_PROJECT_BRANCH_NAME } from "@/lib/projects/branches/project-branch-name";
import { officeTranslationDownloadFilename } from "@/lib/projects/files/office-translation-download";
import { inferSupportedOfficeTranslationFileFormat } from "@/lib/translation/file-formats";

import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "./translation-as-source-support";

/** Uploads whose next run may store their own copy again over anything sent in their place. */
const SYNC_UPLOAD_SURFACES = new Set(["content_sync", "gitlab_content_sync", "github_automation"]);

/** What the destination has at the path a send writes to. */
export type TranslationAsSourceDestinationFile =
  | { state: "empty" }
  /** The last send from this same file: a send replaces it without asking. */
  | { state: "sent_from_here"; versionId: string }
  /** Added by the destination's repository sync, which may put its copy back on its next run. */
  | { state: "from_sync"; versionId: string; addedAt: Date }
  /** Anything else, which a send replaces only when a person confirmed this version. */
  | {
      state: "other";
      versionId: string;
      addedAt: Date;
      /** The person who uploaded it, when a person did. */
      addedBy: string | null;
      /** For a send from elsewhere: the project and path it was built from. */
      sentFrom: { projectId: string; sourcePath: string } | null;
    };

/** The path a send writes to: the same path, with an old `.xls` file sent as `.xlsx`. */
export function translationAsSourceDestinationPath(sourcePath: string): string {
  return inferSupportedOfficeTranslationFileFormat(sourcePath) === "xls"
    ? officeTranslationDownloadFilename(sourcePath, { extension: ".xlsx" })
    : sourcePath;
}

/**
 * The destination's newest version at `destinationPath` on its default branch, which a send
 * writes to, and where it came from.
 */
export async function getTranslationAsSourceDestinationFile(input: {
  organizationId: string;
  destinationProjectId: string;
  destinationPath: string;
  /** The file in the sending project. */
  repositorySourceFileId: string;
}): Promise<TranslationAsSourceDestinationFile> {
  const result = await db.execute<{
    id: string;
    created_at: string | Date;
    upload_surface: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    origin_file_id: string | null;
    origin_project_id: string | null;
    origin_path: string | null;
  }>(sql`
    select
      newest.id,
      newest.created_at,
      newest.upload_surface,
      uploader.first_name,
      uploader.last_name,
      uploader.email,
      origin.repository_source_file_id as origin_file_id,
      origin.project_id as origin_project_id,
      origin.source_path as origin_path
    from repository_source_file_versions newest
    join repository_source_files newest_file
      on newest_file.id = newest.repository_source_file_id
      and newest_file.branch_name = ${DEFAULT_PROJECT_BRANCH_NAME}
    join stored_files stored on stored.id = newest.stored_file_id
    left join users uploader on uploader.id = newest.uploaded_by_user_id
    left join repository_source_file_versions origin
      on newest.upload_surface = ${TRANSLATION_AS_SOURCE_UPLOAD_SURFACE}
      and origin.id = (stored.metadata -> 'translationSource' ->> 'sourceFileVersionId')::uuid
    where newest.organization_id = ${input.organizationId}
      and newest.project_id = ${input.destinationProjectId}
      and newest.source_path = ${input.destinationPath}
    order by newest.created_at desc
    limit 1
  `);
  const row = result.rows[0];
  if (!row) {
    return { state: "empty" };
  }
  if (row.origin_file_id === input.repositorySourceFileId) {
    return { state: "sent_from_here", versionId: row.id };
  }
  const addedAt = new Date(row.created_at);
  if (row.upload_surface && SYNC_UPLOAD_SURFACES.has(row.upload_surface)) {
    return { state: "from_sync", versionId: row.id, addedAt };
  }
  return {
    state: "other",
    versionId: row.id,
    addedAt,
    addedBy: row.email
      ? formatMemberDisplayName({
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
        })
      : null,
    sentFrom:
      row.origin_project_id && row.origin_path
        ? { projectId: row.origin_project_id, sourcePath: row.origin_path }
        : null,
  };
}

/**
 * Why a send may not replace the destination's file, if it may not: a file this file did not send
 * is replaced only when a person confirmed that very version.
 */
export function translationAsSourceDestinationRefusal(
  file: TranslationAsSourceDestinationFile,
  replaceVersionId: string | undefined,
): { code: "destination_file_replaced" } | null {
  switch (file.state) {
    case "empty":
    case "sent_from_here":
      return null;
    case "from_sync":
    case "other":
      return file.versionId === replaceVersionId ? null : { code: "destination_file_replaced" };
  }
}

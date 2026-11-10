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

import { translationSourceFingerprintSql } from "./translation-as-source-fingerprint";
import { TRANSLATION_AS_SOURCE_UPLOAD_SURFACE } from "./translation-as-source-support";

/** The last time a file of this project was sent to another project as its source. */
export type TranslationAsSourceSend = {
  /** The file's path in this project. */
  sourcePath: string;
  destinationProjectId: string;
  locale: string;
  sentAt: Date;
  /**
   * Sending again would send something else: the file was uploaded again with other content,
   * its import settings changed, or a translation in `locale` is no longer the approved text
   * that was sent.
   */
  changedSinceSent: boolean;
  /** A newer version of the file in the destination replaced the send: an upload by hand there, or a send from another project. */
  replacedInDestination: boolean;
};

/**
 * The last send of each of `projectId`'s files to each of `destinationProjectIds`, read from the
 * destination's file versions, which store the version each send was built from and the
 * fingerprint of what it read. A file is changed since sent when its fingerprint now differs.
 */
export async function listTranslationAsSourceSends(input: {
  organizationId: string;
  projectId: string;
  destinationProjectIds: readonly string[];
}): Promise<TranslationAsSourceSend[]> {
  if (input.destinationProjectIds.length === 0) {
    return [];
  }
  const destinationIds = sql.join(
    input.destinationProjectIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute<{
    source_path: string;
    destination_project_id: string;
    locale: string;
    sent_at: string | Date;
    changed_since_sent: boolean;
    replaced_in_destination: boolean;
  }>(sql`
    with sends as (
      select distinct on (original.repository_source_file_id, sent.project_id)
        original.repository_source_file_id as file_id,
        sent.repository_source_file_id as destination_file_id,
        sent.project_id as destination_project_id,
        stored.metadata -> 'translationSource' ->> 'locale' as locale,
        stored.metadata -> 'translationSource' ->> 'fingerprint' as sent_fingerprint,
        sent.created_at as sent_at
      from repository_source_file_versions sent
      join stored_files stored on stored.id = sent.stored_file_id
      join repository_source_file_versions original
        on original.id = (stored.metadata -> 'translationSource' ->> 'sourceFileVersionId')::uuid
      where sent.organization_id = ${input.organizationId}
        and sent.project_id in (${destinationIds})
        and sent.upload_surface = ${TRANSLATION_AS_SOURCE_UPLOAD_SURFACE}
        and stored.metadata -> 'translationSource' ->> 'projectId' = ${input.projectId}
        and original.project_id = ${input.projectId}
      order by original.repository_source_file_id, sent.project_id, sent.created_at desc
    )
    select
      file.source_path,
      sends.destination_project_id,
      sends.locale,
      sends.sent_at,
      ${translationSourceFingerprintSql({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: sql`sends.file_id`,
        locale: sql`sends.locale`,
      })} is distinct from sends.sent_fingerprint as changed_since_sent,
      exists (
        select 1
        from repository_source_file_versions newer
        where newer.repository_source_file_id = sends.destination_file_id
          and newer.created_at > sends.sent_at
      ) as replaced_in_destination
    from sends
    join repository_source_files file on file.id = sends.file_id
    order by file.source_path, sends.destination_project_id
  `);

  return result.rows.map((row) => ({
    sourcePath: row.source_path,
    destinationProjectId: row.destination_project_id,
    locale: row.locale,
    sentAt: new Date(row.sent_at),
    changedSinceSent: row.changed_since_sent,
    replacedInDestination: row.replaced_in_destination,
  }));
}

/** A file of this project whose newest version was sent here from another project. */
export type TranslationAsSourceReceipt = {
  sourcePath: string;
  fromProjectId: string;
  locale: string;
  receivedAt: Date;
  /** The version this send replaced there, when it did not come from the same file. */
  replaced: { addedAt: Date; addedBy: string | null } | null;
};

/**
 * The files of `projectId` whose newest version is a send from another project, with where it
 * came from. A file uploaded here again since is not listed: its newest version is that upload.
 */
export async function listTranslationAsSourceReceipts(input: {
  organizationId: string;
  projectId: string;
}): Promise<TranslationAsSourceReceipt[]> {
  const result = await db.execute<{
    source_path: string;
    from_project_id: string;
    locale: string;
    received_at: string | Date;
    replaced_at: string | Date | null;
    replaced_by_first_name: string | null;
    replaced_by_last_name: string | null;
    replaced_by_email: string | null;
  }>(sql`
    select
      file.source_path,
      stored.metadata -> 'translationSource' ->> 'projectId' as from_project_id,
      stored.metadata -> 'translationSource' ->> 'locale' as locale,
      newest.received_at,
      case
        when previous.origin_file_id is distinct from newest_origin.repository_source_file_id
        then previous.created_at
      end as replaced_at,
      previous.first_name as replaced_by_first_name,
      previous.last_name as replaced_by_last_name,
      previous.email as replaced_by_email
    from (
      -- Each file's newest version, before anything is joined to it.
      select distinct on (version.repository_source_file_id)
        version.repository_source_file_id as file_id,
        version.stored_file_id,
        version.upload_surface,
        version.created_at as received_at
      from repository_source_file_versions version
      where version.organization_id = ${input.organizationId}
        and version.project_id = ${input.projectId}
      order by version.repository_source_file_id, version.created_at desc
    ) newest
    join repository_source_files file on file.id = newest.file_id
    join stored_files stored on stored.id = newest.stored_file_id
    left join repository_source_file_versions newest_origin
      on newest_origin.id = (stored.metadata -> 'translationSource' ->> 'sourceFileVersionId')::uuid
    -- The version just before the send; a replaced one unless it came from the same file.
    left join lateral (
      select
        prior.created_at,
        uploader.first_name,
        uploader.last_name,
        uploader.email,
        prior_origin.repository_source_file_id as origin_file_id
      from repository_source_file_versions prior
      join stored_files prior_stored on prior_stored.id = prior.stored_file_id
      left join repository_source_file_versions prior_origin
        on prior.upload_surface = ${TRANSLATION_AS_SOURCE_UPLOAD_SURFACE}
        and prior_origin.id = (prior_stored.metadata -> 'translationSource' ->> 'sourceFileVersionId')::uuid
      left join users uploader on uploader.id = prior.uploaded_by_user_id
      where prior.repository_source_file_id = newest.file_id
        and prior.created_at < newest.received_at
      order by prior.created_at desc
      limit 1
    ) previous on true
    where newest.upload_surface = ${TRANSLATION_AS_SOURCE_UPLOAD_SURFACE}
      and stored.metadata -> 'translationSource' ->> 'projectId' is not null
    order by file.source_path
  `);

  return result.rows.map((row) => ({
    sourcePath: row.source_path,
    fromProjectId: row.from_project_id,
    locale: row.locale,
    receivedAt: new Date(row.received_at),
    replaced: row.replaced_at
      ? {
          addedAt: new Date(row.replaced_at),
          addedBy: row.replaced_by_email
            ? formatMemberDisplayName({
                firstName: row.replaced_by_first_name,
                lastName: row.replaced_by_last_name,
                email: row.replaced_by_email,
              })
            : null,
        }
      : null,
  }));
}

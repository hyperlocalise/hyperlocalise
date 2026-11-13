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
import { type SQL, sql } from "drizzle-orm";

/**
 * A fingerprint of what sending a file in `locale` carries: the content of the file's newest
 * upload, its import settings, the project's source language (which the Excel writer reads), and
 * each string's key and approved translation. Strings the file no longer has (hidden by an
 * upload) are left out, since a send does not carry them; one hidden by hand still is. For a
 * string without an approved translation, whether it is hidden by hand is included too, since it
 * decides whether the send is refused. Two sends with the same fingerprint build the same file.
 *
 * Each value is a bound value or a column of the surrounding query.
 */
export function translationSourceFingerprintSql(input: {
  organizationId: string | SQL;
  projectId: string | SQL;
  repositorySourceFileId: string | SQL;
  locale: string | SQL;
}): SQL {
  return sql`(
    select md5(jsonb_build_array(
      (
        select newest.source_hash
        from repository_source_file_versions newest
        where newest.repository_source_file_id = fingerprint_file.id
        order by newest.created_at desc
        limit 1
      ),
      fingerprint_file.import_settings,
      (
        select fingerprint_project.source_locale
        from projects fingerprint_project
        where fingerprint_project.id = ${input.projectId}
      ),
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_array(
              fingerprint_key.key,
              case
                when fingerprint_translation.status = 'approved'
                  and fingerprint_translation.text ~ '[^[:space:]]'
                then fingerprint_translation.text
              end,
              case
                when fingerprint_translation.status = 'approved'
                  and fingerprint_translation.text ~ '[^[:space:]]'
                then null
                else fingerprint_key.is_hidden
              end
            )
            order by fingerprint_key.key collate "C"
          ),
          '[]'::jsonb
        )
        from project_translation_keys fingerprint_key
        left join project_translations fingerprint_translation
          on fingerprint_translation.translation_key_id = fingerprint_key.id
          and fingerprint_translation.target_locale = ${input.locale}
        where fingerprint_key.repository_source_file_id = fingerprint_file.id
          and fingerprint_key.organization_id = ${input.organizationId}
          and fingerprint_key.project_id = ${input.projectId}
          and fingerprint_key.hidden_by_sync_at is null
      )
    )::text)
    from repository_source_files fingerprint_file
    where fingerprint_file.id = ${input.repositorySourceFileId}
  )`;
}

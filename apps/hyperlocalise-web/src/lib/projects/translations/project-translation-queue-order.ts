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
import { asc, sql } from "drizzle-orm";

import type { ProjectFileCatQueueSort } from "@/api/routes/project/project.schema";
import * as schema from "@/lib/database/schema";

export function translationKeysQueueOrderBy(input: {
  organizationId: string;
  projectId: string;
  targetLocale?: string;
  queueSort?: ProjectFileCatQueueSort;
  includeSourcePath?: boolean;
}) {
  const fileOrder = input.includeSourcePath
    ? [
        asc(schema.repositorySourceFiles.sourcePath),
        asc(schema.projectTranslationKeys.key),
        asc(schema.projectTranslationKeys.id),
      ]
    : [asc(schema.projectTranslationKeys.key), asc(schema.projectTranslationKeys.id)];

  if (input.queueSort !== "untranslated_first" || !input.targetLocale) {
    return fileOrder;
  }

  const translationMatch = sql`
    ${schema.projectTranslations.translationKeyId} = ${schema.projectTranslationKeys.id}
    and ${schema.projectTranslations.organizationId} = ${input.organizationId}
    and ${schema.projectTranslations.projectId} = ${input.projectId}
    and ${schema.projectTranslations.targetLocale} = ${input.targetLocale}
  `;

  const untranslatedFirstRank = sql`case
    when not exists (
      select 1
      from ${schema.projectTranslations}
      where ${translationMatch}
        and trim(${schema.projectTranslations.text}) != ''
    ) then 0
    when exists (
      select 1
      from ${schema.projectTranslations}
      where ${translationMatch}
        and trim(${schema.projectTranslations.text}) != ''
        and ${schema.projectTranslations.status} != 'approved'
    ) then 1
    else 2
  end`;

  return [untranslatedFirstRank, ...fileOrder];
}

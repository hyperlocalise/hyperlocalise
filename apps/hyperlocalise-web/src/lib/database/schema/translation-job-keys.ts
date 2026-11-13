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
import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { jobs } from "./jobs";
import { projectTranslationKeys } from "./project-strings";

/**
 * The keys of a key job (`translation_job_details.type = keys`). The job's languages stay in
 * `jobs.input_payload.targetLocales`, as for every other job.
 */
export const translationJobKeys = pgTable(
  "translation_job_keys",
  {
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    translationKeyId: uuid("translation_key_id")
      .notNull()
      .references(() => projectTranslationKeys.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.translationKeyId] }),
    index("idx_translation_job_keys_translation_key").on(table.translationKeyId),
  ],
);

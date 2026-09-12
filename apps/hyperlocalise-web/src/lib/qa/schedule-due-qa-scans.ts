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
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";

import { runProjectTranslationQaScan } from "./run-project-qa-scan";

const logger = createLogger("translation-qa-scan-cron");
const DAY_MS = 20 * 60 * 60 * 1000;

export async function runDueTranslationQaScans(input: { limit: number }) {
  const cutoff = new Date(Date.now() - DAY_MS);
  const dueProjects = await db
    .select({
      organizationId: schema.projects.organizationId,
      projectId: schema.projects.id,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.source, "native"),
        eq(schema.projects.qaScanCadence, "daily"),
        or(isNull(schema.projects.qaScanLastRunAt), lt(schema.projects.qaScanLastRunAt, cutoff)),
        sql`not exists (
          select 1 from translation_qa_runs
          where translation_qa_runs.project_id = ${schema.projects.id}
            and translation_qa_runs.status = 'running'
        )`,
      ),
    )
    .orderBy(sql`${schema.projects.qaScanLastRunAt} asc nulls first`)
    .limit(input.limit);

  let started = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const project of dueProjects) {
    started += 1;
    try {
      const result = await runProjectTranslationQaScan({
        organizationId: project.organizationId,
        projectId: project.projectId,
        trigger: "scheduled",
      });
      if (!result.ok) {
        skipped += 1;
        logger.info(
          { projectId: project.projectId, code: result.code },
          "scheduled qa scan skipped",
        );
        continue;
      }
      succeeded += 1;
    } catch {
      failed += 1;
      logger.info({ projectId: project.projectId }, "scheduled qa scan failed");
    }
  }

  return {
    scanned: dueProjects.length,
    started,
    succeeded,
    failed,
    skipped,
  };
}

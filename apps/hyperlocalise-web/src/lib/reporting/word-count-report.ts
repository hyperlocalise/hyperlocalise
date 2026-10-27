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

export type ReportJobOption = {
  id: string;
  title: string;
  projectId: string | null;
  status: string;
  createdAt: string;
};

/**
 * Tasks that have Reports data, newest first, for the task picker: optionally only open ones,
 * those whose title or id contains `q`, or the given ids. A failed task is offered only when
 * asked for by id (a filter already set): it has no work to estimate or to log time on.
 */
export async function listReportJobs(input: {
  organizationId: string;
  projectIds: string[];
  projectId?: string;
  q?: string;
  open?: boolean;
  ids?: string[];
  limit?: number;
}): Promise<ReportJobOption[]> {
  if (input.projectIds.length === 0) return [];
  const title = sql`coalesce(j.input_payload -> 'metadata' ->> 'title', j.id)`;
  const pattern = input.q ? `%${input.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%` : null;
  const result = await db.execute<ReportJobOption>(sql`
    select j.id, ${title} as title, j.project_id as "projectId", j.status, j.created_at as "createdAt"
    from jobs j
    where j.organization_id = ${input.organizationId}
      and j.project_id in (${sql.join(
        input.projectIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      ${input.projectId ? sql`and j.project_id = ${input.projectId}` : sql``}
      ${input.open ? sql`and j.status in ('queued', 'running', 'waiting_for_review')` : sql``}
      ${input.ids?.length ? sql`` : sql`and j.status <> 'failed'`}
      ${pattern ? sql`and (${title} ilike ${pattern} or j.id ilike ${pattern})` : sql``}
      ${
        input.ids?.length
          ? sql`and j.id in (${sql.join(
              input.ids.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql``
      }
      and exists (
        select 1 from reporting_analyses a
        where a.organization_id = j.organization_id and a.job_id = j.id
      )
    order by j.created_at desc
    limit ${input.limit ?? 200}
  `);
  return result.rows;
}

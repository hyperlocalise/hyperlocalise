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
import { sql, type SQL } from "drizzle-orm";

/**
 * What a Reports section is limited to. `projectIds` are the projects the viewer can open; the
 * filters narrow them and never widen them.
 */
export type ReportScope = {
  organizationId: string;
  projectIds: string[];
  projectId?: string;
  jobIds?: string[];
  targetLocale?: string;
};

/** The projects a section reads: the accessible ones, or the filtered one if it is accessible. */
export function scopedProjectIds(scope: Pick<ReportScope, "projectIds" | "projectId">): string[] {
  if (!scope.projectId) return scope.projectIds;
  return scope.projectIds.includes(scope.projectId) ? [scope.projectId] : [];
}

export function idList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

/** The first instant of a UTC day. */
export function dayStart(day: string): SQL {
  return sql`(${day}::date::timestamp at time zone 'UTC')`;
}

/** The first instant after a UTC day. */
export function dayEnd(day: string): SQL {
  return sql`((${day}::date + 1)::timestamp at time zone 'UTC')`;
}

/** The SQL title of a task, falling back to its id. */
export function jobTitle(alias: string): SQL {
  return sql.raw(`coalesce(${alias}.input_payload -> 'metadata' ->> 'title', ${alias}.id)`);
}

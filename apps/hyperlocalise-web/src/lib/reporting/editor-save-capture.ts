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
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { waitForWorkosFeatureFlags } from "@/lib/flags/workos-adapter";
import { workspaceReportsFlag } from "@/lib/flags/workspace-flags";
import { createLogger } from "@/lib/log";

import { captureAnalysis, captureCompletions } from "./capture";

const logger = createLogger("reporting-editor-save-capture");

/** Events younger than this are left for the next run: `created_at` is the insert time, not the
 * commit time, so a slow save can commit an event with an earlier timestamp than one already seen. */
export const EDITOR_SAVE_CAPTURE_CUTOFF_MS = 2 * 60 * 1000;
const EVENTS_PER_ORGANIZATION = 2_000;
/** How long a run waits for this instance's first download of feature flags before stopping. */
const FLAGS_READY_TIMEOUT_MS = 10_000;
const SAVE_EVENT_TYPES = ["string_segment_translation_updated", "string_segment_approved"] as const;

type SaveEvent = {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  eventType: string;
  targetId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type EditorSaveCaptureResult = {
  organizationsProcessed: number;
  organizationsSkipped: number;
  eventsProcessed: number;
  segmentsRecorded: number;
  /** Why the run stopped before checking every workspace, if it did. */
  stopped: "flags_unavailable" | null;
};

type WorkspaceToCheck = {
  organizationId: string;
  workosOrganizationId: string;
};

/**
 * Records content editor saves for Reports from the activity events the Go service writes inside
 * each save's transaction. Runs from the reporting-capture cron. Every write it makes is
 * idempotent through Reports' unique keys, so a window can be re-run safely.
 */
export async function captureEditorSaves(
  input: {
    now?: Date;
    /** Limits the run to these workspaces; every workspace when left out. */
    organizationIds?: string[];
  } = {},
): Promise<EditorSaveCaptureResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - EDITOR_SAVE_CAPTURE_CUTOFF_MS);
  const result: EditorSaveCaptureResult = {
    organizationsProcessed: 0,
    organizationsSkipped: 0,
    eventsProcessed: 0,
    segmentsRecorded: 0,
    stopped: null,
  };
  try {
    await waitForWorkosFeatureFlags({ timeoutMs: FLAGS_READY_TIMEOUT_MS });
  } catch (error) {
    // Until the flags are downloaded every check reads as off, which would pass over the saves of
    // workspaces that have Reports on. Stop without moving any position; the next run retries.
    logger.warn({ error }, "feature flags not downloaded; stopping without moving any position");
    result.stopped = "flags_unavailable";
    return result;
  }
  for (const workspace of await listWorkspacesToCheck(cutoff, input.organizationIds)) {
    const { organizationId } = workspace;
    try {
      if (!(await readReportsFlag(workspace))) {
        // Reports records work from when it is turned on, so saves made while it is off are
        // passed over for good instead of being read again on every run.
        await moveCursorPastSaves(organizationId, cutoff);
        result.organizationsSkipped += 1;
        continue;
      }
      const events = await listPendingSaveEvents(organizationId, cutoff);
      if (events.length === 0) {
        await moveCursorPastSaves(organizationId, cutoff);
        continue;
      }
      result.organizationsProcessed += 1;
      result.segmentsRecorded += await recordSaves(organizationId, events);
      result.eventsProcessed += events.length;
      await advanceCursor(events[events.length - 1]);
    } catch (error) {
      logger.warn({ organizationId, error }, "editor save capture failed; will retry next run");
    }
  }
  return result;
}

/** Throws instead of answering false when the check fails, so a failure never reads as "off". */
async function readReportsFlag(workspace: WorkspaceToCheck): Promise<boolean> {
  const enabled = await workspaceReportsFlag.run({
    identify: () => ({ organization: { id: workspace.workosOrganizationId } }),
  });
  return enabled === true;
}

const SAVE_EVENT_TYPE_LIST = sql.join(
  SAVE_EVENT_TYPES.map((type) => sql`${type}`),
  sql`, `,
);

/**
 * Workspaces with saves after their position, plus workspaces that have no position yet. Each
 * workspace with a position is checked from that position through the activity log's
 * (organization, time, id) index, so a run reads only saves made since the last one.
 */
async function listWorkspacesToCheck(
  cutoff: Date,
  organizationIds?: string[],
): Promise<WorkspaceToCheck[]> {
  if (organizationIds?.length === 0) return [];
  const onlyListed = (column: string) =>
    organizationIds
      ? sql`and ${sql.raw(column)} in (${sql.join(
          organizationIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  const rows = await db.execute<WorkspaceToCheck>(sql`
    select c.organization_id as "organizationId", o.workos_organization_id as "workosOrganizationId"
    from reporting_capture_cursors c
    join organizations o on o.id = c.organization_id
    cross join lateral (
      select 1
      from organization_activity_events e
      where e.organization_id = c.organization_id
        and (e.created_at, e.id) > (c.last_event_created_at, c.last_event_id)
        and e.created_at < ${cutoff}
        and e.event_type in (${SAVE_EVENT_TYPE_LIST})
      limit 1
    ) pending
    where true ${onlyListed("c.organization_id")}
    union all
    select o.id, o.workos_organization_id
    from organizations o
    where not exists (select 1 from reporting_capture_cursors c where c.organization_id = o.id)
      ${onlyListed("o.id")}
    order by 1
  `);
  return rows.rows;
}

async function listPendingSaveEvents(organizationId: string, cutoff: Date): Promise<SaveEvent[]> {
  const cursors = schema.reportingCaptureCursors;
  const [cursor] = await db
    .select({ organizationId: cursors.organizationId })
    .from(cursors)
    .where(eq(cursors.organizationId, organizationId));
  const events = schema.organizationActivityEvents;
  // Compared against the stored cursor inside the database: its timestamp has microseconds, which
  // a JavaScript Date would drop, so the last event already recorded would read as newer.
  const stored = (column: typeof cursors.lastEventId | typeof cursors.lastEventCreatedAt) =>
    sql`(select ${column} from ${cursors} where ${cursors.organizationId} = ${organizationId})`;
  const afterCursor = cursor
    ? sql`(${events.createdAt}, ${events.id}) > (${stored(cursors.lastEventCreatedAt)}, ${stored(cursors.lastEventId)})`
    : undefined;
  return db
    .select({
      id: events.id,
      organizationId: events.organizationId,
      actorUserId: events.actorUserId,
      eventType: events.eventType,
      targetId: events.targetId,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eq(events.organizationId, organizationId),
        inArray(events.eventType, [...SAVE_EVENT_TYPES]),
        lt(events.createdAt, cutoff),
        afterCursor,
      ),
    )
    .orderBy(asc(events.createdAt), asc(events.id))
    .limit(EVENTS_PER_ORGANIZATION);
}

/** Copies the event's own timestamp inside the database: a JavaScript Date keeps milliseconds,
 * while `created_at` has microseconds, so a round trip would place the cursor before the event.
 * A position only moves forward, so an overlapping older run cannot move it back. */
async function advanceCursor(last: SaveEvent) {
  await db.execute(sql`
    insert into reporting_capture_cursors (organization_id, last_event_created_at, last_event_id, updated_at)
    select e.organization_id, e.created_at, e.id, now()
    from organization_activity_events e where e.id = ${last.id}
    on conflict (organization_id) do update
      set last_event_created_at = excluded.last_event_created_at,
          last_event_id = excluded.last_event_id,
          updated_at = now()
      where (excluded.last_event_created_at, excluded.last_event_id)
        > (reporting_capture_cursors.last_event_created_at, reporting_capture_cursors.last_event_id)
  `);
}

/** Moves a workspace's position past every save older than the cutoff, without recording them. */
async function moveCursorPastSaves(organizationId: string, cutoff: Date) {
  await db.execute(sql`
    insert into reporting_capture_cursors (organization_id, last_event_created_at, last_event_id, updated_at)
    select ${organizationId}::uuid, coalesce(latest.created_at, ${cutoff}::timestamptz),
      coalesce(latest.id, '00000000-0000-0000-0000-000000000000'::uuid), now()
    from (select 1) as one
    left join lateral (
      select e.created_at, e.id
      from organization_activity_events e
      where e.organization_id = ${organizationId}
        and e.created_at < ${cutoff}
        and e.event_type in (${SAVE_EVENT_TYPE_LIST})
      order by e.created_at desc, e.id desc
      limit 1
    ) latest on true
    on conflict (organization_id) do update
      set last_event_created_at = excluded.last_event_created_at,
          last_event_id = excluded.last_event_id,
          updated_at = now()
      where (excluded.last_event_created_at, excluded.last_event_id)
        > (reporting_capture_cursors.last_event_created_at, reporting_capture_cursors.last_event_id)
  `);
}

type SavedSegment = {
  projectId: string;
  translationKeyId: string;
  targetLocale: string;
  step: "translation" | "review";
  actorUserId: string | null;
};

/** One record per saved occurrence, language and step; the latest event wins. */
function savedSegments(events: SaveEvent[]): SavedSegment[] {
  const latest = new Map<string, SavedSegment>();
  for (const event of events) {
    const projectId = event.payload.projectId;
    const targetLocale = event.payload.targetLocale;
    if (typeof projectId !== "string" || typeof targetLocale !== "string") continue;
    const approved =
      event.eventType === "string_segment_approved" || event.payload.nextStatus === "approved";
    const step = approved ? "review" : "translation";
    const segment = {
      projectId,
      translationKeyId: event.targetId,
      targetLocale,
      step,
      actorUserId: event.actorUserId,
    } as const;
    latest.set(`${projectId}:${event.targetId}:${targetLocale}:${step}`, segment);
  }
  return [...latest.values()];
}

async function recordSaves(organizationId: string, events: SaveEvent[]): Promise<number> {
  const segments = savedSegments(events);
  if (segments.length === 0) return 0;
  const keyIds = [...new Set(segments.map((segment) => segment.translationKeyId))];
  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      projectId: schema.projectTranslationKeys.projectId,
      sourceText: schema.projectTranslationKeys.sourceText,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, organizationId),
        inArray(schema.projectTranslationKeys.id, keyIds),
      ),
    );
  const keyById = new Map(keys.map((key) => [key.id, key]));
  const translations = await db
    .select({
      translationKeyId: schema.projectTranslations.translationKeyId,
      targetLocale: schema.projectTranslations.targetLocale,
      text: schema.projectTranslations.text,
      sourceJobId: schema.projectTranslations.sourceJobId,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.organizationId, organizationId),
        inArray(schema.projectTranslations.translationKeyId, keyIds),
      ),
    );
  const translationByKey = new Map(
    translations.map((row) => [`${row.translationKeyId}:${row.targetLocale}`, row]),
  );
  const projectIds = [...new Set(segments.map((segment) => segment.projectId))];
  const projects = await db
    .select({ id: schema.projects.id, sourceLocale: schema.projects.sourceLocale })
    .from(schema.projects)
    .where(inArray(schema.projects.id, projectIds));
  const sourceLocaleByProject = new Map(projects.map((row) => [row.id, row.sourceLocale ?? "en"]));

  let recorded = 0;
  // Group by job, language and step so one analysis call covers every occurrence saved together.
  const groups = new Map<string, { segment: SavedSegment; sourceJobId: string | undefined }[]>();
  for (const segment of segments) {
    const key = keyById.get(segment.translationKeyId);
    const translation = translationByKey.get(`${segment.translationKeyId}:${segment.targetLocale}`);
    if (!key || key.projectId !== segment.projectId || !translation?.text.trim()) continue;
    const sourceJobId = translation.sourceJobId ?? undefined;
    const groupKey = `${segment.projectId}:${sourceJobId ?? ""}:${segment.targetLocale}:${segment.step}:${segment.actorUserId ?? ""}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ segment, sourceJobId });
    groups.set(groupKey, group);
  }
  for (const group of groups.values()) {
    const { segment, sourceJobId } = group[0];
    const sourceEntries = Object.fromEntries(
      group.map(({ segment }) => [
        segment.translationKeyId,
        keyById.get(segment.translationKeyId)!.sourceText,
      ]),
    );
    const shared = {
      organizationId,
      jobId: sourceJobId,
      targetLocale: segment.targetLocale,
      sourceEntries,
      step: segment.step,
    };
    await captureAnalysis({
      ...shared,
      projectId: segment.projectId,
      sourceLocale: sourceLocaleByProject.get(segment.projectId) ?? "en",
      billable: true,
    });
    await captureCompletions({ ...shared, provenance: "human", actorUserId: segment.actorUserId });
    recorded += group.length;
  }
  return recorded;
}

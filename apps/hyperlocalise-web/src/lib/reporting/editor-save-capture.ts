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
import { createLogger } from "@/lib/log";

import { captureAnalysis, captureCompletions, isWorkspaceReportsCaptureEnabled } from "./capture";

const logger = createLogger("reporting-editor-save-capture");

/** Events younger than this are left for the next run: `created_at` is the insert time, not the
 * commit time, so a slow save can commit an event with an earlier timestamp than one already seen. */
export const EDITOR_SAVE_CAPTURE_CUTOFF_MS = 2 * 60 * 1000;
const EVENTS_PER_ORGANIZATION = 2_000;
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
};

/**
 * Records content editor saves for Reports from the activity events the Go service writes inside
 * each save's transaction. Runs from the reporting-capture cron. Every write it makes is
 * idempotent through Reports' unique keys, so a window can be re-run safely.
 */
export async function captureEditorSaves(
  input: {
    now?: Date;
  } = {},
): Promise<EditorSaveCaptureResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - EDITOR_SAVE_CAPTURE_CUTOFF_MS);
  const result: EditorSaveCaptureResult = {
    organizationsProcessed: 0,
    organizationsSkipped: 0,
    eventsProcessed: 0,
    segmentsRecorded: 0,
  };
  const organizations = await listOrganizationsWithPendingSaves(cutoff);
  for (const organizationId of organizations) {
    const enabled = await isWorkspaceReportsCaptureEnabled(organizationId);
    const events = await listPendingSaveEvents(organizationId, cutoff);
    if (events.length === 0) continue;
    if (!enabled) {
      // Reports is off, or the flag could not be read (the check answers false either way):
      // keep the cursor where it is, so a failed check never skips past a person's work. A
      // workspace with Reports off costs one bounded query per run.
      result.organizationsSkipped += 1;
      continue;
    }
    result.organizationsProcessed += 1;
    try {
      result.segmentsRecorded += await recordSaves(organizationId, events);
      result.eventsProcessed += events.length;
      await advanceCursor(events[events.length - 1]);
    } catch (error) {
      logger.warn({ organizationId, error }, "editor save capture failed; will retry next run");
    }
  }
  return result;
}

async function listOrganizationsWithPendingSaves(cutoff: Date): Promise<string[]> {
  const rows = await db.execute<{ organizationId: string }>(sql`
    select distinct e.organization_id as "organizationId"
    from organization_activity_events e
    left join reporting_capture_cursors c on c.organization_id = e.organization_id
    where e.event_type in (${sql.join(
      SAVE_EVENT_TYPES.map((type) => sql`${type}`),
      sql`, `,
    )})
      and e.created_at <= ${cutoff}
      and (c.organization_id is null or (e.created_at, e.id) > (c.last_event_created_at, c.last_event_id))
  `);
  return rows.rows.map((row) => row.organizationId);
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
 * while `created_at` has microseconds, so a round trip would place the cursor before the event. */
async function advanceCursor(last: SaveEvent) {
  await db.execute(sql`
    insert into reporting_capture_cursors (organization_id, last_event_created_at, last_event_id, updated_at)
    select e.organization_id, e.created_at, e.id, now()
    from organization_activity_events e where e.id = ${last.id}
    on conflict (organization_id) do update
      set last_event_created_at = excluded.last_event_created_at,
          last_event_id = excluded.last_event_id,
          updated_at = now()
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

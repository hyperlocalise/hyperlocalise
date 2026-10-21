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
import { readWorkosFeatureFlag, waitForWorkosFeatureFlags } from "@/lib/flags/workos-adapter";
import { WORKSPACE_REPORTS_FLAG } from "@/lib/flags/workos-flag-entities";
import { createLogger } from "@/lib/log";

import {
  MemoryScoreCache,
  prepareMemoryScores,
  recordAnalysis,
  recordCompletions,
} from "./capture";

const logger = createLogger("reporting-editor-save-capture");

/** Events younger than this are left for the next run: `created_at` is the insert time, not the
 * commit time, so a slow save can commit an event with an earlier timestamp than one already seen. */
export const EDITOR_SAVE_CAPTURE_CUTOFF_MS = 2 * 60 * 1000;
const EVENTS_PER_ORGANIZATION = 2_000;
/** Saves recorded before a workspace's position moves, so a stopped run keeps its finished work. */
const EVENTS_PER_BATCH = 200;
/** How long a run waits for this instance's first download of feature flags before stopping. */
const FLAGS_READY_TIMEOUT_MS = 10_000;
/**
 * Approvals made in the web app or through MCP reach the activity log through a queue and carry
 * the time they were queued, so one delivered late can land behind a position already passed.
 * Each run looks back this far for approvals that were passed without being recorded.
 */
const LATE_APPROVAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const LATE_APPROVALS_PER_ORGANIZATION = 500;
const SAVE_EVENT_TYPES = ["string_segment_translation_updated", "string_segment_approved"] as const;

type SaveEvent = {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorKind: string;
  eventType: string;
  targetId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type EditorSaveCaptureResult = {
  organizationsProcessed: number;
  organizationsSkipped: number;
  /** Workspaces given a first position at the cut-off, without recording earlier saves. */
  organizationsStarted: number;
  /** Approvals recorded late because they reached the activity log after the run that passed them. */
  lateApprovalsRecorded: number;
  eventsProcessed: number;
  segmentsRecorded: number;
  /** Why the run stopped before checking every workspace, if it did. */
  stopped: "flags_unavailable" | "time_budget" | null;
};

type WorkspaceToCheck = {
  organizationId: string;
  workosOrganizationId: string;
  /** False the first time the task sees the workspace. */
  hasPosition: boolean;
};

/** Native string ids are uuids; an external tool's id (e.g. a Crowdin string id) is not. */
const NATIVE_STRING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNDO_OPERATION_PREFIX = "undo:";

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
    /** Once aborted, the run starts no new batch and keeps what it has finished. */
    signal?: AbortSignal;
    eventsPerBatch?: number;
  } = {},
): Promise<EditorSaveCaptureResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - EDITOR_SAVE_CAPTURE_CUTOFF_MS);
  const result: EditorSaveCaptureResult = {
    organizationsProcessed: 0,
    organizationsSkipped: 0,
    organizationsStarted: 0,
    lateApprovalsRecorded: 0,
    eventsProcessed: 0,
    segmentsRecorded: 0,
    stopped: null,
  };
  let flagsConfigured: boolean;
  try {
    flagsConfigured = await waitForWorkosFeatureFlags({ timeoutMs: FLAGS_READY_TIMEOUT_MS });
  } catch (error) {
    // Until the flags are downloaded every check reads as off, which would pass over the saves of
    // workspaces that have Reports on. Stop without moving any position; the next run retries.
    logger.warn({ error }, "feature flags not downloaded; stopping without moving any position");
    result.stopped = "flags_unavailable";
    return result;
  }
  const memoryCache = new MemoryScoreCache();
  const eventsPerBatch = input.eventsPerBatch ?? EVENTS_PER_BATCH;
  const reportsOff: string[] = [];
  workspaces: for (const workspace of await listWorkspaces(input.organizationIds)) {
    if (input.signal?.aborted) {
      result.stopped = "time_budget";
      break;
    }
    const { organizationId } = workspace;
    try {
      if (!(flagsConfigured && (await readReportsFlag(workspace)))) {
        reportsOff.push(organizationId);
        continue;
      }
      if (!workspace.hasPosition) {
        // Reports records work from when the task first sees a workspace with Reports on, so
        // earlier saves are not recorded as today's work. Later saves are read next run.
        await moveCursorTo(organizationId, cutoff);
        result.organizationsStarted += 1;
        continue;
      }
      const events = await listPendingSaveEvents(organizationId, cutoff);
      if (events.length > 0) result.organizationsProcessed += 1;
      for (let start = 0; start < events.length; start += eventsPerBatch) {
        const batch = events.slice(start, start + eventsPerBatch);
        result.segmentsRecorded += await recordSaves(
          organizationId,
          batch,
          memoryCache,
          input.signal,
        );
        result.eventsProcessed += batch.length;
        await advanceCursor(batch[batch.length - 1]);
      }
      if (events.length < EVENTS_PER_ORGANIZATION) {
        // Nothing left before the cut-off: move up to it, so the next run reads only newer events.
        await moveCursorTo(organizationId, cutoff);
      }
      const late = await listLateApprovals(organizationId, cutoff);
      if (late.length > 0) {
        await recordSaves(organizationId, late, memoryCache, input.signal);
        result.lateApprovalsRecorded += late.length;
      }
    } catch (error) {
      if (error instanceof TimeBudgetReached) {
        result.stopped = "time_budget";
        break workspaces;
      }
      logger.warn({ organizationId, error }, "editor save capture failed; will retry next run");
    }
  }
  if (reportsOff.length > 0) {
    // Reports records work from when it is turned on, so a workspace with it off keeps no
    // position, and is started at the cut-off if Reports is turned on later.
    await db
      .delete(schema.reportingCaptureCursors)
      .where(inArray(schema.reportingCaptureCursors.organizationId, reportsOff));
    result.organizationsSkipped = reportsOff.length;
  }
  return result;
}

/** Thrown between groups of saves once the run's time is up; the batch is retried next run. */
class TimeBudgetReached extends Error {}

/** Throws when the check fails rather than answering false, so a failure never reads as "off". */
function readReportsFlag(workspace: WorkspaceToCheck): Promise<boolean> {
  return readWorkosFeatureFlag(WORKSPACE_REPORTS_FLAG, {
    organization: { id: workspace.workosOrganizationId },
  });
}

/**
 * Every workspace, with whether it has a position, in a different order each run so a workspace
 * that keeps running out of time cannot hold back the ones after it.
 */
async function listWorkspaces(organizationIds?: string[]): Promise<WorkspaceToCheck[]> {
  if (organizationIds?.length === 0) return [];
  const rows = await db.execute<WorkspaceToCheck>(sql`
    select o.id as "organizationId", o.workos_organization_id as "workosOrganizationId",
      (c.organization_id is not null) as "hasPosition"
    from organizations o
    left join reporting_capture_cursors c on c.organization_id = o.id
    ${
      organizationIds
        ? sql`where o.id in (${sql.join(
            organizationIds.map((id) => sql`${id}`),
            sql`, `,
          )})`
        : sql``
    }
    order by random()
  `);
  return rows.rows;
}

/**
 * Approvals passed by the position within the lookback, after the workspace was started, that have
 * no recorded review yet: queued approvals that reached the activity log late. Approvals carry no
 * source revision, so one counts as recorded when a review of the string's current source text
 * exists, or any review of it was written after the approval (the run that passed it recorded
 * it). A review of an earlier source text written before the approval does not count.
 */
async function listLateApprovals(organizationId: string, cutoff: Date): Promise<SaveEvent[]> {
  const rows = await db.execute<SaveEvent>(sql`
    select e.id, e.organization_id as "organizationId", e.actor_user_id as "actorUserId",
      e.actor_kind as "actorKind", e.event_type as "eventType", e.target_id as "targetId",
      e.payload, e.created_at as "createdAt"
    from organization_activity_events e
    join reporting_capture_cursors c on c.organization_id = e.organization_id
    join project_translation_keys k
      on k.organization_id = e.organization_id
      and k.id::text = lower(e.target_id)
    where e.organization_id = ${organizationId}
      and e.event_type = 'string_segment_approved'
      and e.created_at >= greatest(c.started_at, ${new Date(cutoff.getTime() - LATE_APPROVAL_LOOKBACK_MS)}::timestamptz)
      and (e.created_at, e.id) <= (c.last_event_created_at, c.last_event_id)
      and e.target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (
        select 1
        from reporting_analyses a
        join reporting_activity r on r.analysis_id = a.id and r.kind = 'completion'
        where a.organization_id = e.organization_id
          and a.segment_id = e.target_id
          and a.target_locale = e.payload ->> 'targetLocale'
          and a.step = 'review'
          and (
            a.source_revision = encode(sha256(convert_to(k.source_text, 'UTF8')), 'hex')
            or r.created_at >= e.created_at
          )
      )
    order by e.created_at, e.id
    limit ${LATE_APPROVALS_PER_ORGANIZATION}
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
      actorKind: events.actorKind,
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

/** Moves a workspace's position up to the cut-off, starting it there if it has none. */
async function moveCursorTo(organizationId: string, cutoff: Date) {
  await db.execute(sql`
    insert into reporting_capture_cursors (organization_id, last_event_created_at, last_event_id, updated_at)
    values (${organizationId}, ${cutoff}, '00000000-0000-0000-0000-000000000000', now())
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
  /** Done by an AI agent (MCP tools, in-app agents): recorded as automated, not billable. */
  automated: boolean;
};

/** One record per saved occurrence, language and step; the latest event wins. */
function savedSegments(events: SaveEvent[]): SavedSegment[] {
  const latest = new Map<string, SavedSegment>();
  for (const event of events) {
    const projectId = event.payload.projectId;
    const targetLocale = event.payload.targetLocale;
    if (typeof projectId !== "string" || typeof targetLocale !== "string") continue;
    // Approvals made in an external translation tool name the tool's own string id, which has no
    // native string to record; looking it up as one would fail the whole batch on every run.
    if (!NATIVE_STRING_ID.test(event.targetId)) continue;
    // Restoring an earlier version or undoing an operation puts back work already recorded.
    if (typeof event.payload.restoredFromRevisionId === "string") continue;
    if (
      typeof event.payload.operationId === "string" &&
      event.payload.operationId.startsWith(UNDO_OPERATION_PREFIX)
    )
      continue;
    const approved =
      event.eventType === "string_segment_approved" || event.payload.nextStatus === "approved";
    const step = approved ? "review" : "translation";
    const segment = {
      projectId,
      translationKeyId: event.targetId,
      targetLocale,
      step,
      actorUserId: event.actorUserId,
      automated: event.actorKind === "agent",
    } as const;
    latest.set(`${projectId}:${event.targetId}:${targetLocale}:${step}`, segment);
  }
  return [...latest.values()];
}

async function recordSaves(
  organizationId: string,
  events: SaveEvent[],
  memoryCache: MemoryScoreCache,
  signal: AbortSignal | undefined,
): Promise<number> {
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
    const groupKey = `${segment.projectId}:${sourceJobId ?? ""}:${segment.targetLocale}:${segment.step}:${segment.actorUserId ?? ""}:${segment.automated}`;
    const group = groups.get(groupKey) ?? [];
    group.push({ segment, sourceJobId });
    groups.set(groupKey, group);
  }
  // Groups of one project and language share a memory, so keeping them together lets the cache
  // load it once.
  const memoryOrder = (group: { segment: SavedSegment }[]) =>
    `${group[0].segment.projectId}:${group[0].segment.targetLocale}`;
  const ordered = [...groups.values()].sort((left, right) =>
    memoryOrder(left).localeCompare(memoryOrder(right)),
  );
  // Score each project and language's texts in one pass, so a memory read in slices is read once
  // per batch rather than once per group.
  const textsByMemory = new Map<
    string,
    { projectId: string; targetLocale: string; texts: string[] }
  >();
  for (const group of ordered) {
    const { projectId, targetLocale } = group[0].segment;
    const entry = textsByMemory.get(memoryOrder(group)) ?? { projectId, targetLocale, texts: [] };
    for (const { segment } of group)
      entry.texts.push(keyById.get(segment.translationKeyId)!.sourceText);
    textsByMemory.set(memoryOrder(group), entry);
  }
  for (const { projectId, targetLocale, texts } of textsByMemory.values()) {
    if (signal?.aborted) throw new TimeBudgetReached();
    await prepareMemoryScores(
      {
        projectId,
        sourceLocale: sourceLocaleByProject.get(projectId) ?? "en",
        targetLocale,
        sourceTexts: texts,
      },
      memoryCache,
    );
  }
  for (const group of ordered) {
    if (signal?.aborted) throw new TimeBudgetReached();
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
    await recordAnalysis(
      {
        ...shared,
        projectId: segment.projectId,
        sourceLocale: sourceLocaleByProject.get(segment.projectId) ?? "en",
        billable: !segment.automated,
      },
      { memoryCache },
    );
    await recordCompletions({
      ...shared,
      provenance: segment.automated ? "automated" : "human",
      actorUserId: segment.automated ? null : segment.actorUserId,
    });
    recorded += group.length;
  }
  return recorded;
}

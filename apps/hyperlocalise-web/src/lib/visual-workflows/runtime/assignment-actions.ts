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
import { and, count, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type {
  VisualAssigneeSource,
  VisualAssignmentRule,
  VisualAssignmentStrategy,
  VisualTaskStep,
} from "../schema/types";
import { loadCrowdinAssignees } from "./crowdin-actions";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { parseWorkflowList } from "./localization-actions";

const OPEN_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;
const FALLBACK_RULE_ID = "fallback";
const HOUR_MS = 3_600_000;

const JOB_TYPE_ALIASES: Record<string, VisualTaskStep> = {
  translate: "translate",
  translation: "translate",
  edit: "edit",
  "post-edit": "edit",
  post_edit: "edit",
  postedit: "edit",
  mtpe: "edit",
  proofread: "proofread",
  proofreading: "proofread",
  review: "proofread",
};

export type AssignmentAttributes = {
  locales: string[];
  jobType: VisualTaskStep | null;
  size: number | null;
  dueAt: Date | null;
};

function failure(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message } };
}

/** Reads a job type as people and other systems write it: "post-edit", "MTPE", "review"... */
export function normalizeJobType(value: string): VisualTaskStep | null {
  return JOB_TYPE_ALIASES[value.trim().toLowerCase()] ?? null;
}

function parseSize(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const size = Number(value.trim());
  return Number.isFinite(size) ? size : null;
}

function parseDueAt(value: string): Date | null {
  if (!value.trim()) return null;
  const dueAt = new Date(value.trim());
  return Number.isNaN(dueAt.getTime()) ? null : dueAt;
}

export function readAssignmentAttributes(input: {
  locale: unknown;
  jobType: string;
  size: unknown;
  dueAt: string;
}): AssignmentAttributes {
  return {
    locales: parseWorkflowList(input.locale),
    jobType: normalizeJobType(input.jobType),
    size: parseSize(input.size),
    dueAt: parseDueAt(input.dueAt),
  };
}

function localeCovered(locale: string, ruleLocales: readonly string[]): boolean {
  const wanted = locale.toLowerCase();
  return ruleLocales.some((entry) => {
    const ruleLocale = entry.toLowerCase();
    return wanted === ruleLocale || wanted.startsWith(`${ruleLocale}-`);
  });
}

/**
 * Whether a rule applies to the work. Every condition the rule sets must hold, and one it sets on
 * a value the work does not have fails, so a rule for urgent work never takes undated work. Work
 * in several locales needs a rule covering all of them, since one person does the whole job.
 */
export function assignmentRuleMatches(
  rule: VisualAssignmentRule,
  work: AssignmentAttributes,
  now: Date,
): boolean {
  const ruleLocales = parseWorkflowList(rule.locales);
  if (ruleLocales.length > 0) {
    if (work.locales.length === 0) return false;
    if (!work.locales.every((locale) => localeCovered(locale, ruleLocales))) return false;
  }
  if (rule.jobTypes.length > 0 && (!work.jobType || !rule.jobTypes.includes(work.jobType))) {
    return false;
  }
  if (rule.minSize !== undefined || rule.maxSize !== undefined) {
    if (work.size === null) return false;
    if (rule.minSize !== undefined && work.size < rule.minSize) return false;
    if (rule.maxSize !== undefined && work.size > rule.maxSize) return false;
  }
  if (rule.dueWithinHours !== undefined) {
    if (!work.dueAt) return false;
    if (work.dueAt.getTime() - now.getTime() > rule.dueWithinHours * HOUR_MS) return false;
  }
  return true;
}

/** The first rule that applies, by its place in the table, or null when none does. */
export function findAssignmentRule(
  rules: readonly VisualAssignmentRule[],
  work: AssignmentAttributes,
  now: Date,
): { rule: VisualAssignmentRule; number: number } | null {
  const index = rules.findIndex((rule) => assignmentRuleMatches(rule, work, now));
  return index === -1 ? null : { rule: rules[index]!, number: index + 1 };
}

/** The person after the one picked last, wrapping around; the first when the last has left. */
export function nextInRotation(pool: readonly string[], last: string | null): string {
  const lastIndex = last ? pool.indexOf(last) : -1;
  return pool[(lastIndex + 1) % pool.length]!;
}

/** Whoever has the fewest open jobs; a tie goes to whoever is listed first. */
export function leastBusy(pool: readonly string[], openJobs: ReadonlyMap<string, number>): string {
  let best = pool[0]!;
  for (const candidate of pool) {
    if ((openJobs.get(candidate) ?? 0) < (openJobs.get(best) ?? 0)) best = candidate;
  }
  return best;
}

/** Who can take the work, by the id the rules list them under, with how much each has open. */
type Roster = Map<string, { name: string; email: string; openWork: number }>;

/** Workspace members among the listed WorkOS ids, with their open Hyperlocalise jobs. */
async function loadWorkspaceRoster(
  organizationId: string,
  workosUserIds: readonly string[],
): Promise<Roster> {
  const members = await db
    .select({
      userId: schema.users.id,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .innerJoin(
      schema.organizationMemberships,
      eq(schema.organizationMemberships.userId, schema.users.id),
    )
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        inArray(schema.users.workosUserId, [...workosUserIds]),
      ),
    );
  if (members.length === 0) return new Map();

  const openJobs = await db
    .select({ ownerUserId: schema.jobs.ownerUserId, value: count() })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, organizationId),
        inArray(
          schema.jobs.ownerUserId,
          members.map((member) => member.userId),
        ),
        inArray(schema.jobs.status, [...OPEN_JOB_STATUSES]),
      ),
    )
    .groupBy(schema.jobs.ownerUserId);
  const openByUserId = new Map(openJobs.map((row) => [row.ownerUserId, row.value]));

  return new Map(
    members.map((member) => [
      member.workosUserId,
      {
        email: member.email,
        name: [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email,
        openWork: openByUserId.get(member.userId) ?? 0,
      },
    ]),
  );
}

/**
 * Takes the next person in turn for one rule. The cursor row is locked for the pick, so runs at
 * the same time take different people. Each step run stores its own pick, so a retry still gets
 * that person after a later run has already moved the cursor.
 */
export async function takeRoundRobinTurn(input: {
  visualWorkflowId: string;
  nodeId: string;
  ruleId: string;
  pool: readonly string[];
  stepKey?: string;
}): Promise<string> {
  const cursors = schema.visualWorkflowAssignmentCursors;
  const picks = schema.visualWorkflowAssignmentPicks;
  const cursorKey = and(
    eq(cursors.workflowId, input.visualWorkflowId),
    eq(cursors.nodeId, input.nodeId),
    eq(cursors.ruleId, input.ruleId),
  );
  return db.transaction(async (tx) => {
    await tx
      .insert(cursors)
      .values({
        workflowId: input.visualWorkflowId,
        nodeId: input.nodeId,
        ruleId: input.ruleId,
      })
      .onConflictDoNothing();
    const [cursor] = await tx
      .select({ last: cursors.lastAssigneeId })
      .from(cursors)
      .where(cursorKey)
      .for("update");
    if (input.stepKey) {
      const [existing] = await tx
        .select({ assigneeId: picks.assigneeId })
        .from(picks)
        .where(
          and(
            eq(picks.workflowId, input.visualWorkflowId),
            eq(picks.nodeId, input.nodeId),
            eq(picks.ruleId, input.ruleId),
            eq(picks.stepKey, input.stepKey),
          ),
        );
      if (existing && input.pool.includes(existing.assigneeId)) {
        return existing.assigneeId;
      }
    }
    const next = nextInRotation(input.pool, cursor?.last ?? null);
    await tx.update(cursors).set({ lastAssigneeId: next }).where(cursorKey);
    if (input.stepKey) {
      await tx
        .insert(picks)
        .values({
          workflowId: input.visualWorkflowId,
          nodeId: input.nodeId,
          ruleId: input.ruleId,
          stepKey: input.stepKey,
          assigneeId: next,
        })
        .onConflictDoUpdate({
          target: [picks.workflowId, picks.nodeId, picks.ruleId, picks.stepKey],
          set: { assigneeId: next },
        });
    }
    return next;
  });
}

export async function runPickAssigneeAction(input: {
  organizationId: string;
  visualWorkflowId?: string;
  nodeId: string;
  idempotencyKey?: string;
  locale: unknown;
  jobType: string;
  size: unknown;
  dueAt: string;
  rules: readonly VisualAssignmentRule[];
  fallbackAssigneeIds: readonly string[];
  strategy: VisualAssignmentStrategy;
  peopleSource?: VisualAssigneeSource;
  crowdinProjectId?: string;
  workosUserId?: string;
  signal?: AbortSignal;
  now?: Date;
}): Promise<VisualWorkflowNodeExecutionResult> {
  const work = readAssignmentAttributes(input);
  if (input.jobType.trim() && !work.jobType) {
    return failure("unknown_job_type", "The job type must be translate, post-edit or proofread.");
  }
  if (input.dueAt.trim() && !work.dueAt) {
    return failure("invalid_due_date", "The due date is not a date, such as 2026-05-01T17:00Z.");
  }

  const matched = findAssignmentRule(input.rules, work, input.now ?? new Date());
  const listed = matched ? matched.rule.assigneeIds : input.fallbackAssigneeIds;
  if (listed.length === 0) {
    return failure(
      matched ? "assignment_rule_has_no_people" : "no_assignment_rule_matched",
      matched
        ? `Rule ${matched.number} has nobody to assign. Add people to it.`
        : "No rule matched this work and there is nobody to fall back to.",
    );
  }

  const fromCrowdin = input.peopleSource === "crowdin";
  let roster: Roster;
  if (fromCrowdin) {
    const loaded = await loadCrowdinAssignees({
      organizationId: input.organizationId,
      workosUserId: input.workosUserId,
      signal: input.signal,
      crowdinProjectId: input.crowdinProjectId ?? "",
      assigneeIds: listed,
    });
    if (!loaded.ok) return loaded.result;
    roster = new Map(
      [...loaded.assignees].map(([id, person]) => [
        id,
        { name: person.name, email: person.email, openWork: person.openTasks },
      ]),
    );
  } else {
    roster = await loadWorkspaceRoster(input.organizationId, listed);
  }
  const pool = listed.filter((id) => roster.has(id));
  if (pool.length === 0) {
    return failure(
      "no_available_assignee",
      fromCrowdin
        ? "Nobody listed for this work is still a member of the Crowdin project."
        : "Nobody listed for this work is still a member of the workspace.",
    );
  }

  const openJobs = new Map(pool.map((id) => [id, roster.get(id)!.openWork]));
  let assignee: string;
  if (input.strategy === "least_busy") {
    assignee = leastBusy(pool, openJobs);
  } else if (input.strategy === "round_robin" && input.visualWorkflowId) {
    assignee = await takeRoundRobinTurn({
      visualWorkflowId: input.visualWorkflowId,
      nodeId: input.nodeId,
      ruleId: matched?.rule.id ?? FALLBACK_RULE_ID,
      pool,
      stepKey: input.idempotencyKey,
    });
  } else {
    assignee = pool[0]!;
  }

  const member = roster.get(assignee)!;
  return {
    ok: true,
    output: {
      assigneeId: assignee,
      assigneeEmail: member.email,
      assigneeName: member.name,
      matchedRule: matched ? matched.rule.name.trim() || `Rule ${matched.number}` : "Fallback",
      matchedRuleNumber: matched?.number ?? 0,
      strategy: input.strategy,
      openJobs: openJobs.get(assignee) ?? 0,
      candidates: pool,
    },
  };
}

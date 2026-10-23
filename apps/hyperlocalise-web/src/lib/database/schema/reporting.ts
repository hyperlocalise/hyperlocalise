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
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  numeric,
  jsonb,
  index,
  unique,
  uniqueIndex,
  boolean,
  date,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./organizations";
import { projects } from "./projects";
import { jobs } from "./jobs";
import {
  COMPLETION_SOURCES,
  RATE_BASES,
  type CompletionSource,
} from "@/lib/reporting/report-units";
import type { MatchBucket } from "@/lib/reporting/word-analysis";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const organizationId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const projectId = () => text("project_id").references(() => projects.id, { onDelete: "set null" });
const jobId = () => text("job_id").references(() => jobs.id, { onDelete: "set null" });
const amount = (name: string) => numeric(name, { precision: 24, scale: 8 });

/**
 * When Reports started recording for a workspace (it records work from then on, never earlier
 * work), and which version of the daily summary has been built for it.
 */
export const reportingWorkspaces = pgTable("reporting_workspaces", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  summaryVersion: integer("summary_version"),
});
export const reportingRates = pgTable(
  "reporting_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    step: text("step", { enum: ["translation", "review"] }).notNull(),
    basis: text("basis", { enum: RATE_BASES }).notNull(),
    rate: amount("rate").notNull(),
    percentages: jsonb("percentages")
      .$type<Partial<Record<MatchBucket, number>>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** A line taken off its rate card; rates are versioned rows, so removal is a new row. */
    retired: boolean("retired").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("reporting_rates_org").on(t.organizationId)],
);
/** A rate card's own settings; its lines are the `reporting_rates` rows with its name. */
export const reportingRateCards = pgTable(
  "reporting_rate_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    /** The basis a new line on the card starts with; each line can still have its own. */
    defaultBasis: text("default_basis", { enum: RATE_BASES }).notNull().default("word"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reporting_rate_cards_name").on(t.organizationId, t.name)],
);
export const reportingBudgets = pgTable(
  "reporting_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    projectId: projectId(),
    budget: amount("budget").notNull(),
    rateCardName: text("rate_card_name"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reporting_budgets_project").on(t.organizationId, t.projectId)],
);
/** A task's own pricing for one step: a rate card, a time estimate or a fixed fee. */
export const reportingTaskRates = pgTable(
  "reporting_task_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    jobId: jobId(),
    step: text("step", { enum: ["translation", "review"] }).notNull(),
    /** The task's rate card: each language is priced by that card's line for it. */
    rateCardName: text("rate_card_name"),
    /** The card's prices are taken as they were at this time, so later edits leave the task. */
    pricedAt: timestamp("priced_at", { withTimezone: true }),
    /**
     * The task's one rate line for every language, before it had a card. Not read any more;
     * kept so the rework needs one migration, to be dropped in a later clean-up.
     */
    rateId: uuid("rate_id").references(() => reportingRates.id),
    estimatedMinutes: integer("estimated_minutes"),
    overrideUsd: amount("override_usd"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reporting_task_rates_job_step").on(t.organizationId, t.jobId, t.step)],
);
export const reportingAnalyses = pgTable(
  "reporting_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    projectId: projectId(),
    /**
     * The task, kept when the task is deleted: clearing it could make the row identical to a
     * content editor analysis of the same string (no task), which the identity key forbids.
     */
    jobId: text("job_id"),
    step: text("step", { enum: ["translation", "review"] })
      .notNull()
      .default("translation"),
    segmentId: text("segment_id").notNull(),
    sourceRevision: text("source_revision").notNull(),
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    words: integer("words"),
    /** Characters of the source text, without and with spaces; null when it could not be read. */
    characters: integer("characters"),
    charactersWithSpaces: integer("characters_with_spaces"),
    billable: boolean("billable").notNull().default(false),
    isCurrent: boolean("is_current").notNull().default(true),
    matchScore: integer("match_score"),
    bucket: text("bucket").$type<MatchBucket>().notNull(),
    algorithmVersion: integer("algorithm_version").notNull().default(1),
    rateId: uuid("rate_id").references(() => reportingRates.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique("reporting_analysis_identity")
      .on(t.organizationId, t.jobId, t.segmentId, t.sourceRevision, t.targetLocale, t.step)
      .nullsNotDistinct(),
    index("reporting_analysis_project").on(t.organizationId, t.projectId, t.createdAt),
    index("reporting_analysis_segment").on(t.organizationId, t.segmentId, t.targetLocale, t.step),
  ],
);
export const reportingActivity = pgTable(
  "reporting_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    projectId: projectId(),
    jobId: jobId(),
    operationKey: text("operation_key").notNull(),
    kind: text("kind", { enum: ["completion", "status", "workflow"] }).notNull(),
    step: text("step").notNull(),
    targetLocale: text("target_locale"),
    analysisId: uuid("analysis_id").references(() => reportingAnalyses.id),
    status: text("status"),
    durationMs: integer("duration_ms"),
    /** The person whose work a completion records; null for automated work. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Where a completion's text came from; null when it was not known. */
    source: text("source", { enum: COMPLETION_SOURCES }).$type<CompletionSource>(),
    /** A person finished the string without changing the text they were given; null when unknown. */
    unchanged: boolean("unchanged"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reporting_activity_operation").on(t.organizationId, t.operationKey),
    index("reporting_activity_filter").on(t.organizationId, t.projectId, t.createdAt),
  ],
);
const summaryMeasure = (name: string) => integer(name).notNull().default(0);
/**
 * Counts in one of four units: words, strings, characters without spaces, characters with spaces.
 * `source` counts each source text once however many languages it goes into; `arrived` is the
 * current version of each string analysed that day; `arrivedDone` the part of `arrived` that has
 * been finished since; `finished` every string finished that day; `finishedByPerson` the part of
 * `finished` a person did.
 */
const summaryMeasures = () => ({
  sourceWords: summaryMeasure("source_words"),
  sourceStrings: summaryMeasure("source_strings"),
  sourceCharacters: summaryMeasure("source_characters"),
  sourceCharactersWithSpaces: summaryMeasure("source_characters_with_spaces"),
  arrivedWords: summaryMeasure("arrived_words"),
  arrivedStrings: summaryMeasure("arrived_strings"),
  arrivedCharacters: summaryMeasure("arrived_characters"),
  arrivedCharactersWithSpaces: summaryMeasure("arrived_characters_with_spaces"),
  /** Arrived strings whose words could not be counted. */
  arrivedUncounted: summaryMeasure("arrived_uncounted"),
  arrivedDoneWords: summaryMeasure("arrived_done_words"),
  arrivedDoneStrings: summaryMeasure("arrived_done_strings"),
  arrivedDoneCharacters: summaryMeasure("arrived_done_characters"),
  arrivedDoneCharactersWithSpaces: summaryMeasure("arrived_done_characters_with_spaces"),
  finishedWords: summaryMeasure("finished_words"),
  finishedStrings: summaryMeasure("finished_strings"),
  finishedCharacters: summaryMeasure("finished_characters"),
  finishedCharactersWithSpaces: summaryMeasure("finished_characters_with_spaces"),
  finishedByPersonWords: summaryMeasure("finished_by_person_words"),
  finishedByPersonStrings: summaryMeasure("finished_by_person_strings"),
  finishedByPersonCharacters: summaryMeasure("finished_by_person_characters"),
  finishedByPersonCharactersWithSpaces: summaryMeasure("finished_by_person_characters_with_spaces"),
  /** The part of `finished` a person finished without changing the text they were given. */
  finishedUnchangedWords: summaryMeasure("finished_unchanged_words"),
  finishedUnchangedStrings: summaryMeasure("finished_unchanged_strings"),
  finishedUnchangedCharacters: summaryMeasure("finished_unchanged_characters"),
  finishedUnchangedCharactersWithSpaces: summaryMeasure(
    "finished_unchanged_characters_with_spaces",
  ),
});
/**
 * Where a finished string's text came from (`SUMMARY_SOURCES`), or "" on a row that only holds
 * arrivals: a key column, so a report can split finished work by source and the rest sum over it.
 */
const summarySource = () => text("source").notNull().default("");
/**
 * Reports' daily summary, worked out from `reporting_analyses` and `reporting_activity` so the
 * Reports page never joins those two large tables while it is read. One set of rows per workspace,
 * project and UTC day, rewritten whole by `refreshSummaryDay`. There is no unique key, so the
 * foreign-key actions below, which mirror the raw tables, can never fail.
 */
export const reportingDailyByTask = pgTable(
  "reporting_daily_by_task",
  {
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The analysis's task, kept like `reporting_analyses.job_id` when the task is deleted. */
    jobId: text("job_id"),
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    step: text("step", { enum: ["translation", "review"] }).notNull(),
    bucket: text("bucket").$type<MatchBucket>().notNull(),
    source: summarySource(),
    /** The analysis was marked billable: work a person is paid for. */
    payable: boolean("payable").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    ...summaryMeasures(),
  },
  (t) => [
    index("reporting_daily_by_task_project").on(t.organizationId, t.projectId, t.day),
    index("reporting_daily_by_task_job").on(t.organizationId, t.jobId),
    index("reporting_daily_by_task_open")
      .on(t.organizationId, t.projectId, t.jobId)
      .where(sql`${t.arrivedStrings} > ${t.arrivedDoneStrings}`),
  ],
);
/** `reporting_daily_by_task` without the task, source language and payable split. */
export const reportingDailyByProject = pgTable(
  "reporting_daily_by_project",
  {
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetLocale: text("target_locale").notNull(),
    step: text("step", { enum: ["translation", "review"] }).notNull(),
    bucket: text("bucket").$type<MatchBucket>().notNull(),
    source: summarySource(),
    day: date("day", { mode: "string" }).notNull(),
    ...summaryMeasures(),
  },
  (t) => [index("reporting_daily_by_project_project").on(t.organizationId, t.projectId, t.day)],
);
/**
 * The strings each project holds now, by language, step and match band: the daily rows'
 * arrivals summed over every day, rewritten with them, so a whole project can be estimated
 * without reading its days. The project's own source language stands for every row's.
 */
export const reportingCurrentByProject = pgTable(
  "reporting_current_by_project",
  {
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    step: text("step", { enum: ["translation", "review"] }).notNull(),
    bucket: text("bucket").$type<MatchBucket>().notNull(),
    arrivedWords: summaryMeasure("arrived_words"),
    arrivedStrings: summaryMeasure("arrived_strings"),
    arrivedCharacters: summaryMeasure("arrived_characters"),
    arrivedCharactersWithSpaces: summaryMeasure("arrived_characters_with_spaces"),
    arrivedUncounted: summaryMeasure("arrived_uncounted"),
    arrivedDoneWords: summaryMeasure("arrived_done_words"),
    arrivedDoneStrings: summaryMeasure("arrived_done_strings"),
    arrivedDoneCharacters: summaryMeasure("arrived_done_characters"),
    arrivedDoneCharactersWithSpaces: summaryMeasure("arrived_done_characters_with_spaces"),
  },
  (t) => [index("reporting_current_by_project_project").on(t.organizationId, t.projectId)],
);
/**
 * Workspace, project and day whose summary rows need working out again. A write bumps
 * `generation`; a refresh removes the mark only if no write bumped it while the refresh ran.
 */
export const reportingSummaryQueue = pgTable(
  "reporting_summary_queue",
  {
    organizationId: organizationId(),
    projectId: text("project_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    generation: integer("generation").notNull().default(1),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.projectId, t.day] }),
    index("reporting_summary_queue_marked").on(t.markedAt),
  ],
);
/** Where the scheduled reporting capture got to in each organization's activity events. */
export const reportingCaptureCursors = pgTable("reporting_capture_cursors", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  lastEventCreatedAt: timestamp("last_event_created_at", { withTimezone: true }).notNull(),
  lastEventId: uuid("last_event_id").notNull(),
  /** When the task first gave the workspace a position; nothing earlier is recorded. */
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const reportingTimeEntries = pgTable(
  "reporting_time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    projectId: projectId(),
    jobId: jobId(),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => users.id),
    step: text("step", { enum: ["translation", "review"] }).notNull(),
    targetLocale: text("target_locale").notNull(),
    workDate: timestamp("work_date", { withTimezone: true }).notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    rateId: uuid("rate_id").references(() => reportingRates.id),
    voided: boolean("voided").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("reporting_time_filter").on(t.organizationId, t.projectId, t.workDate)],
);
export const reportingCosts = pgTable(
  "reporting_costs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: organizationId(),
    projectId: projectId(),
    jobId: jobId(),
    operationKey: text("operation_key").notNull(),
    kind: text("kind", { enum: ["human", "ai", "expense"] }).notNull(),
    step: text("step").notNull(),
    targetLocale: text("target_locale"),
    amountUsd: amount("amount_usd"),
    basis: text("basis", {
      enum: ["rate", "reported", "estimated", "unpriced", "manual"],
    }).notNull(),
    rateId: uuid("rate_id").references(() => reportingRates.id),
    timeEntryId: uuid("time_entry_id").references(() => reportingTimeEntries.id),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    tokenCategories: jsonb("token_categories").$type<Record<string, number>>(),
    pricingVersion: text("pricing_version"),
    note: text("note"),
    voided: boolean("voided").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reporting_cost_operation").on(t.organizationId, t.operationKey),
    index("reporting_cost_filter").on(t.organizationId, t.projectId, t.createdAt),
  ],
);
export const reportingAudit = pgTable("reporting_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: organizationId(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  resourceId: text("resource_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: createdAt(),
});

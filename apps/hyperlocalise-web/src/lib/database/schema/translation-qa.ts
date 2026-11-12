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
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";
import { projects } from "./projects";
import { projectTranslationKeys, projectTranslations } from "./project-strings";

export type TranslationQaRunTrigger = "manual" | "scheduled";
export type TranslationQaRunStatus = "queued" | "running" | "succeeded" | "failed";
export type TranslationQaScanCadence = "off" | "daily";
export type TranslationQaSeverity = "error" | "warning";

export type TranslationQaSummary = {
  byCheckType: Record<string, number>;
  bySeverity: Record<string, number>;
  byLocale: Record<string, number>;
  skippedChecksByLocale?: Record<string, string[]>;
  checkVersion?: number;
  /** Set when guideline checks stop early; holds the go-svc error code only. */
  guidelineCheckHaltCode?: string;
};

/**
 * One background QA scan of a native project's stored translations.
 */
export const translationQaRuns = pgTable(
  "translation_qa_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<TranslationQaRunTrigger>().notNull(),
    checkPolicy: jsonb("check_policy")
      .$type<import("@/lib/qa/qa-policy").QaCheckPolicy>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").$type<TranslationQaRunStatus>().notNull().default("queued"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    segmentCount: integer("segment_count").notNull().default(0),
    findingCount: integer("finding_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    summary: jsonb("summary").$type<TranslationQaSummary>().notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_translation_qa_runs_org_project_created").on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
    index("idx_translation_qa_runs_project_status").on(table.projectId, table.status),
    uniqueIndex("translation_qa_runs_one_running_per_project")
      .on(table.organizationId, table.projectId)
      .where(sql`${table.status} = 'running'`),
  ],
);

/**
 * A failing or warning check from a native QA scan.
 */
export const translationQaFindings = pgTable(
  "translation_qa_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => translationQaRuns.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    translationKeyId: uuid("translation_key_id").references(() => projectTranslationKeys.id, {
      onDelete: "set null",
    }),
    translationId: uuid("translation_id").references(() => projectTranslations.id, {
      onDelete: "set null",
    }),
    sourcePath: text("source_path"),
    key: text("key").notNull(),
    targetLocale: text("target_locale").notNull(),
    checkType: text("check_type").notNull(),
    severity: text("severity").$type<TranslationQaSeverity>().notNull(),
    category: text("category").notNull(),
    status: text("status").$type<"open" | "ignored" | "resolved">().notNull().default("open"),
    ignoreReason: text("ignore_reason"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ruleVersion: integer("rule_version").notNull().default(1),
    message: text("message").notNull(),
    relatedTokens: jsonb("related_tokens").$type<string[]>().notNull().default([]),
    sourceText: text("source_text").notNull(),
    targetText: text("target_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_translation_qa_findings_key").on(table.translationKeyId),
    index("idx_translation_qa_findings_translation").on(table.translationId),
    index("idx_translation_qa_findings_run").on(table.runId),
    index("idx_translation_qa_findings_run_locale").on(table.runId, table.targetLocale),
    index("idx_translation_qa_findings_run_check").on(table.runId, table.checkType),
  ],
);

/**
 * Segments a QA scan actually guideline-checked during a run (editor-shaped lookups and
 * empty-target skips). Used when resolving older guideline findings without re-checking.
 */
export const translationQaGuidelineCoverage = pgTable(
  "translation_qa_guideline_coverage",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => translationQaRuns.id, { onDelete: "cascade" }),
    translationKeyId: uuid("translation_key_id")
      .notNull()
      .references(() => projectTranslationKeys.id, { onDelete: "cascade" }),
    targetLocale: text("target_locale").notNull(),
  },
  (table) => [
    index("idx_translation_qa_guideline_coverage_run").on(table.runId),
    uniqueIndex("translation_qa_guideline_coverage_run_key_locale").on(
      table.runId,
      table.translationKeyId,
      table.targetLocale,
    ),
  ],
);

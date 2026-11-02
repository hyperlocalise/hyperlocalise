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
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  EngineSetupProgressStage,
  EngineSetupRunStatus,
  EngineSetupSourceKind,
  EngineSuggestionConflict,
  EngineSuggestionEvidence,
  EngineSuggestionKind,
  EngineSuggestionPayload,
  EngineSuggestionStatus,
} from "@/lib/engine-setup/types";
import { glossaries } from "./translation-memory";
import { organizations, users } from "./organizations";

/**
 * One AI setup wizard run that reads a source (a website for now) and proposes
 * glossary terms, style rules, and a brand voice for the organization's engine.
 */
export const engineSetupRuns = pgTable(
  "engine_setup_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceKind: text("source_kind").$type<EngineSetupSourceKind>().notNull().default("website"),
    sourceUrl: text("source_url").notNull(),
    // Locale of the source content. Null until the crawl detects it when not provided.
    sourceLocale: text("source_locale"),
    status: text("status").$type<EngineSetupRunStatus>().notNull().default("queued"),
    progressStage: text("progress_stage").$type<EngineSetupProgressStage>(),
    pagesRead: integer("pages_read").notNull().default(0),
    workflowRunId: text("workflow_run_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    // Glossary that received applied terms, when any.
    appliedGlossaryId: uuid("applied_glossary_id").references(() => glossaries.id, {
      onDelete: "set null",
    }),
    // Knowledge memory revision written by apply, when any.
    appliedKnowledgeRevisionId: uuid("applied_knowledge_revision_id"),
    appliedByUserId: uuid("applied_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_engine_setup_runs_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_engine_setup_runs_org_status").on(table.organizationId, table.status),
    check("engine_setup_runs_pages_read_check", sql`${table.pagesRead} >= 0`),
  ],
);

/**
 * A reviewable suggestion produced by an engine setup run. Nothing reaches the
 * glossary or knowledge memory until a user applies accepted suggestions.
 */
export const engineSetupSuggestions = pgTable(
  "engine_setup_suggestions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => engineSetupRuns.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").$type<EngineSuggestionKind>().notNull(),
    // Normalized identity within a run so retried steps do not duplicate rows.
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<EngineSuggestionPayload>().notNull(),
    evidence: jsonb("evidence")
      .$type<EngineSuggestionEvidence[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidence: integer("confidence").notNull(),
    status: text("status").$type<EngineSuggestionStatus>().notNull().default("pending"),
    conflict: text("conflict").$type<EngineSuggestionConflict>(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("engine_setup_suggestions_run_kind_dedupe_key").on(
      table.runId,
      table.kind,
      table.dedupeKey,
    ),
    index("idx_engine_setup_suggestions_run_status").on(table.runId, table.status),
    index("idx_engine_setup_suggestions_org").on(table.organizationId),
    check(
      "engine_setup_suggestions_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`,
    ),
  ],
);

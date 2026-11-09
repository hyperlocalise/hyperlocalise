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
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { LOCALISATION_DEEP_AUDIT_DEFAULT_PAGE_LIMIT } from "../../localisation-audit/deep/types";
import type {
  LocalisationDeepAuditDiffState,
  LocalisationDeepAuditStatus,
  LocalisationDeepAuditSummary,
  LocalisationDeepAuditTrigger,
} from "@/lib/localisation-audit/deep/types";
import type {
  LocalisationAuditCrawledPage,
  LocalisationAuditDimensionScores,
  LocalisationAuditFindingSeverity,
} from "@/lib/localisation-audit/types";
import { linkedDomains } from "./linked-domains";
import { organizations, users } from "./organizations";

/**
 * Private, org-scoped localisation audits of a verified linked domain. Runs use
 * the public audit's checks over a larger, sitemap-driven page set.
 */
export const localisationDeepAudits = pgTable(
  "localisation_deep_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkedDomainId: uuid("linked_domain_id")
      .notNull()
      .references(() => linkedDomains.id, { onDelete: "cascade" }),
    status: text("status").$type<LocalisationDeepAuditStatus>().notNull().default("queued"),
    trigger: text("trigger").$type<LocalisationDeepAuditTrigger>().notNull().default("manual"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    pageLimit: integer("page_limit").notNull().default(LOCALISATION_DEEP_AUDIT_DEFAULT_PAGE_LIMIT),
    pagesDiscovered: integer("pages_discovered").notNull().default(0),
    pagesRendered: integer("pages_rendered").notNull().default(0),
    score: integer("score"),
    dimensionScores: jsonb("dimension_scores").$type<LocalisationAuditDimensionScores>(),
    summary: jsonb("summary").$type<LocalisationDeepAuditSummary>(),
    previousRunId: uuid("previous_run_id").references(
      (): AnyPgColumn => localisationDeepAudits.id,
      { onDelete: "set null" },
    ),
    workflowRunId: text("workflow_run_id"),
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
    index("idx_localisation_deep_audits_org").on(table.organizationId),
    index("idx_localisation_deep_audits_domain_created").on(table.linkedDomainId, table.createdAt),
    uniqueIndex("uq_localisation_deep_audits_in_flight")
      .on(table.linkedDomainId)
      .where(sql`${table.status} in ('queued', 'crawling', 'scoring')`),
  ],
);

/**
 * Parsed signals and layout measurements for each rendered page. Kept with the
 * run so checks can be re-run over the same evidence without crawling again.
 */
export const localisationDeepAuditPages = pgTable(
  "localisation_deep_audit_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => localisationDeepAudits.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    finalUrl: text("final_url").notNull(),
    httpStatus: integer("http_status").notNull(),
    locale: text("locale"),
    templateKey: text("template_key").notNull(),
    artifact: jsonb("artifact").$type<LocalisationAuditCrawledPage>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_localisation_deep_audit_pages_run_url").on(table.runId, table.url),
    index("idx_localisation_deep_audit_pages_run_template").on(table.runId, table.templateKey),
  ],
);

export const localisationDeepAuditFindings = pgTable(
  "localisation_deep_audit_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => localisationDeepAudits.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    creditId: text("credit_id").notNull(),
    dimension: text("dimension").notNull(),
    severity: text("severity").$type<LocalisationAuditFindingSeverity>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    url: text("url"),
    templateKey: text("template_key"),
    locale: text("locale"),
    location: text("location"),
    evidence: text("evidence"),
    advice: text("advice"),
    confidence: integer("confidence"),
    fingerprint: text("fingerprint").notNull(),
    diffState: text("diff_state").$type<LocalisationDeepAuditDiffState>().notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_localisation_deep_audit_findings_run_credit").on(table.runId, table.creditId),
    index("idx_localisation_deep_audit_findings_run_fingerprint").on(
      table.runId,
      table.fingerprint,
    ),
  ],
);

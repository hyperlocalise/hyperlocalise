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

import type {
  LocalisationAuditLeadDeliveryStatus,
  LocalisationAuditProgressStage,
  LocalisationAuditReport,
  LocalisationAuditRunSource,
  LocalisationAuditTeaser,
} from "@/lib/localisation-audit/types";
import { organizations } from "./organizations";

/**
 * Public one-off localisation health checks keyed by normalized domain.
 * Used as a marketing lead magnet with SEO result pages.
 */
export const localisationAudits = pgTable(
  "localisation_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domainKey: text("domain_key").notNull(),
    domainSlug: text("domain_slug").notNull(),
    sourceUrl: text("source_url").notNull(),
    status: text("status").notNull().default("queued"),
    attemptNumber: integer("attempt_number").notNull().default(1),
    progressStage: text("progress_stage").$type<LocalisationAuditProgressStage>(),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    /**
     * Who started the latest quota-consuming attempt. User form starts and
     * scheduled/internal starts each have a separate daily cap.
     */
    runSource: text("run_source").$type<LocalisationAuditRunSource>().notNull().default("user"),
    workflowRunId: text("workflow_run_id"),
    focusLocales: jsonb("focus_locales").$type<string[]>().notNull().default([]),
    score: integer("score"),
    teaser: jsonb("teaser").$type<LocalisationAuditTeaser>(),
    report: jsonb("report").$type<LocalisationAuditReport>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    // Set when an org successfully claims this audit via linked_domains verification.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    // Mirrors linked_domains.id after claim (no FK to avoid circular schema imports).
    linkedDomainId: uuid("linked_domain_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_localisation_audits_domain_key").on(table.domainKey),
    uniqueIndex("uq_localisation_audits_domain_slug").on(table.domainSlug),
    index("idx_localisation_audits_status").on(table.status),
    index("idx_localisation_audits_completed_at").on(table.completedAt),
    index("idx_localisation_audits_status_updated_at").on(table.statusUpdatedAt),
    index("idx_localisation_audits_score").on(table.score),
    index("idx_localisation_audits_organization_id").on(table.organizationId),
    index("idx_localisation_audits_linked_domain_id").on(table.linkedDomainId),
    index("idx_localisation_audits_run_source_last_attempt").on(table.runSource, table.lastAttemptAt),
  ],
);

/**
 * Email unlocks for full audit reports (lead capture + verified delivery).
 */
export const localisationAuditLeads = pgTable(
  "localisation_audit_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => localisationAudits.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    locale: text("locale").notNull().default("en"),
    deliveryStatus: text("delivery_status")
      .$type<LocalisationAuditLeadDeliveryStatus>()
      .notNull()
      .default("pending"),
    tokenHash: text("token_hash"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailError: text("email_error"),
    lastEmailQueuedAt: timestamp("last_email_queued_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_localisation_audit_leads_audit_email").on(table.auditId, table.email),
    index("idx_localisation_audit_leads_audit").on(table.auditId),
    index("idx_localisation_audit_leads_token_hash").on(table.tokenHash),
    index("idx_localisation_audit_leads_delivery_status").on(table.deliveryStatus),
  ],
);

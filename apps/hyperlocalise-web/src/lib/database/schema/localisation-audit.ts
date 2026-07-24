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
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  localisationAuditCategoryEnum,
  localisationAuditEventTypeEnum,
  localisationAuditEvidenceKindEnum,
  localisationAuditIndexingStateEnum,
  localisationAuditPageStatusEnum,
  localisationAuditReportVisibilityEnum,
  localisationAuditSeverityEnum,
  localisationAuditStatusEnum,
} from "./enums";

export type LocalisationAuditAlternativeData = {
  locale: string;
  url: string;
  source: "hreflang" | "language_link";
};

export type LocalisationAuditPageExtractionData = {
  htmlLang: string | null;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  alternateLinks: LocalisationAuditAlternativeData[];
  headings: string[];
  navigation: string[];
  callsToAction: string[];
  visibleTextSample: string;
};

export type LocalisationAuditFindingEvidenceData = {
  excerpt?: string;
  observedValue?: string;
  expectedValue?: string;
};

export type LocalisationAuditScoreData = {
  status: "scored" | "insufficient_evidence";
  score: number | null;
  earnedPoints: number;
  applicablePoints: number;
  evaluatedRuleCount: number;
};

export type LocalisationAuditReportData = {
  reportVersion: string;
  scoreVersion: string;
  domain: string;
  auditedAt: string;
  status: "completed" | "partial";
  overallScore: number | null;
  overallStatus: "scored" | "insufficient_evidence";
  categoryScores: Record<"technical" | "linguistic" | "market", LocalisationAuditScoreData>;
  findings: Array<{
    code: string;
    category: "technical" | "linguistic" | "market";
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    impact: string;
    recommendation: string;
    evidence?: LocalisationAuditFindingEvidenceData;
  }>;
  lockedFindingCount: number;
  limitations: string[];
};

export type LocalisationAuditPrivateReportData = LocalisationAuditReportData & {
  pages: Array<{
    url: string;
    locale: string | null;
    status: "extracted" | "blocked" | "failed";
  }>;
};

export type LocalisationAuditEventMetadata = {
  source?: "api" | "email" | "report";
  findingCount?: number;
  localeCount?: number;
  deliveryStatus?: "sent" | "skipped" | "failed";
};

export const localisationAudits = pgTable(
  "localisation_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: localisationAuditStatusEnum("status").notNull().default("preparing"),
    submittedUrl: text("submitted_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    domain: text("domain").notNull(),
    domainHash: text("domain_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    detectedLocale: text("detected_locale"),
    targetLocale: text("target_locale"),
    targetMarket: text("target_market"),
    alternatives: jsonb("alternatives")
      .$type<LocalisationAuditAlternativeData[]>()
      .notNull()
      .default([]),
    scoreVersion: text("score_version").notNull(),
    reportVersion: text("report_version").notNull(),
    failureCode: text("failure_code"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_localisation_audits_ip_budget").on(table.ipHash, table.createdAt),
    index("idx_localisation_audits_domain_budget").on(table.domainHash, table.createdAt),
    index("idx_localisation_audits_status_created").on(table.status, table.createdAt),
    check("localisation_audits_domain_hash_check", sql`char_length(${table.domainHash}) = 64`),
    check("localisation_audits_ip_hash_check", sql`char_length(${table.ipHash}) = 64`),
    check("localisation_audits_score_version_check", sql`char_length(${table.scoreVersion}) > 0`),
    check("localisation_audits_report_version_check", sql`char_length(${table.reportVersion}) > 0`),
  ],
);

export const localisationAuditPages = pgTable(
  "localisation_audit_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => localisationAudits.id, { onDelete: "cascade" }),
    normalizedUrl: text("normalized_url").notNull(),
    locale: text("locale"),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: localisationAuditPageStatusEnum("status").notNull(),
    httpStatus: integer("http_status"),
    contentFingerprint: text("content_fingerprint"),
    extraction: jsonb("extraction").$type<LocalisationAuditPageExtractionData>(),
    failureCode: text("failure_code"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_localisation_audit_pages_audit_url").on(table.auditId, table.normalizedUrl),
    index("idx_localisation_audit_pages_audit").on(table.auditId),
    index("idx_localisation_audit_pages_fingerprint").on(table.contentFingerprint),
    check(
      "localisation_audit_pages_http_status_check",
      sql`${table.httpStatus} is null or (${table.httpStatus} >= 100 and ${table.httpStatus} <= 599)`,
    ),
  ],
);

export const localisationAuditFindings = pgTable(
  "localisation_audit_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => localisationAudits.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").references(() => localisationAuditPages.id, { onDelete: "set null" }),
    ruleCode: text("rule_code").notNull(),
    category: localisationAuditCategoryEnum("category").notNull(),
    severity: localisationAuditSeverityEnum("severity").notNull(),
    confidence: doublePrecision("confidence").notNull(),
    evidenceKind: localisationAuditEvidenceKindEnum("evidence_kind").notNull(),
    title: text("title").notNull(),
    evidence: jsonb("evidence").$type<LocalisationAuditFindingEvidenceData>().notNull().default({}),
    impact: text("impact").notNull(),
    recommendation: text("recommendation").notNull(),
    availablePoints: integer("available_points").notNull(),
    earnedPoints: integer("earned_points").notNull(),
    publicPreviewEligible: boolean("public_preview_eligible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_localisation_audit_findings_rule_page").on(
      table.auditId,
      table.ruleCode,
      table.pageId,
    ),
    index("idx_localisation_audit_findings_audit_category").on(table.auditId, table.category),
    check(
      "localisation_audit_findings_confidence_check",
      sql`${table.confidence} >= 0 and ${table.confidence} <= 1`,
    ),
    check(
      "localisation_audit_findings_points_check",
      sql`${table.availablePoints} >= 0 and ${table.earnedPoints} >= 0 and ${table.earnedPoints} <= ${table.availablePoints}`,
    ),
  ],
);

export const localisationAuditReports = pgTable(
  "localisation_audit_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => localisationAudits.id, { onDelete: "cascade" }),
    publicSlug: text("public_slug").notNull(),
    visibility: localisationAuditReportVisibilityEnum("visibility").notNull().default("public"),
    indexingState: localisationAuditIndexingStateEnum("indexing_state")
      .notNull()
      .default("noindex"),
    scoreVersion: text("score_version").notNull(),
    reportVersion: text("report_version").notNull(),
    publicReport: jsonb("public_report").$type<LocalisationAuditReportData>().notNull(),
    privateReport: jsonb("private_report").$type<LocalisationAuditPrivateReportData>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_localisation_audit_reports_audit").on(table.auditId),
    uniqueIndex("uq_localisation_audit_reports_public_slug").on(table.publicSlug),
    index("idx_localisation_audit_reports_visibility").on(table.visibility, table.indexingState),
    check(
      "localisation_audit_reports_public_slug_check",
      sql`char_length(${table.publicSlug}) >= 16 and char_length(${table.publicSlug}) <= 64`,
    ),
  ],
);

export const localisationAuditLeads = pgTable(
  "localisation_audit_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => localisationAudits.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    emailDeliveryStatus: text("email_delivery_status").notNull().default("pending"),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_localisation_audit_leads_audit").on(table.auditId),
    check(
      "localisation_audit_leads_delivery_status_check",
      sql`${table.emailDeliveryStatus} in ('pending', 'sent', 'skipped', 'failed')`,
    ),
  ],
);

export const localisationAuditEvents = pgTable(
  "localisation_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => localisationAudits.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => localisationAuditLeads.id, { onDelete: "set null" }),
    eventType: localisationAuditEventTypeEnum("event_type").notNull(),
    metadata: jsonb("metadata").$type<LocalisationAuditEventMetadata>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_localisation_audit_events_audit_time").on(table.auditId, table.occurredAt),
    index("idx_localisation_audit_events_type_time").on(table.eventType, table.occurredAt),
  ],
);

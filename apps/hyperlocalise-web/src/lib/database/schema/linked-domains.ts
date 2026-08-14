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
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { localisationAudits } from "./localisation-audits";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

export type LinkedDomainStatus = "pending_verification" | "verified" | "failed" | "revoked";

export type LinkedDomainVerificationMethod = "dns_txt" | "html_file" | "meta_tag";

/**
 * Org-scoped domain properties claimed via DNS/HTML/meta verification
 * (Search Console–style). First verified claim of a domainKey wins globally.
 */
export const linkedDomains = pgTable(
  "linked_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    domainKey: text("domain_key").notNull(),
    domainSlug: text("domain_slug").notNull(),
    sourceUrl: text("source_url").notNull(),
    status: text("status").$type<LinkedDomainStatus>().notNull().default("pending_verification"),
    verificationToken: text("verification_token").notNull(),
    preferredMethod: text("preferred_method").$type<LinkedDomainVerificationMethod>(),
    verifiedMethod: text("verified_method").$type<LinkedDomainVerificationMethod>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    localisationAuditId: uuid("localisation_audit_id").references(() => localisationAudits.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_linked_domains_org_domain_key").on(table.organizationId, table.domainKey),
    uniqueIndex("uq_linked_domains_verified_domain_key")
      .on(table.domainKey)
      .where(sql`${table.status} = 'verified'`),
    index("idx_linked_domains_org").on(table.organizationId),
    index("idx_linked_domains_domain_slug").on(table.domainSlug),
    index("idx_linked_domains_status").on(table.status),
    index("idx_linked_domains_localisation_audit_id").on(table.localisationAuditId),
  ],
);

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

import { linkedDomains } from "./linked-domains";
import { organizations } from "./organizations";

export type DomainResearchKeywordIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "navigational";

export type DomainResearchSerpSnapshotRow = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  isOwn?: boolean;
};

/**
 * Saved keyword ideas for a claimed domain and DataForSEO market.
 */
export const domainResearchKeywords = pgTable(
  "domain_research_keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkedDomainId: uuid("linked_domain_id")
      .notNull()
      .references(() => linkedDomains.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    seedKeyword: text("seed_keyword"),
    marketId: text("market_id").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    volume: integer("volume").notNull().default(0),
    kd: integer("kd").notNull().default(0),
    cpc: doublePrecision("cpc").notNull().default(0),
    intent: text("intent").$type<DomainResearchKeywordIntent>().notNull().default("informational"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_domain_research_keywords_domain_market_kw").on(
      table.linkedDomainId,
      table.locationCode,
      table.languageCode,
      table.keyword,
    ),
    index("idx_domain_research_keywords_org").on(table.organizationId),
    index("idx_domain_research_keywords_domain").on(table.linkedDomainId),
  ],
);

/**
 * Rank-tracked keywords with the latest live SERP position.
 */
export const domainResearchTrackedKeywords = pgTable(
  "domain_research_tracked_keywords",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkedDomainId: uuid("linked_domain_id")
      .notNull()
      .references(() => linkedDomains.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    marketId: text("market_id").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    device: text("device").notNull().default("desktop"),
    volume: integer("volume").notNull().default(0),
    position: integer("position"),
    previousPosition: integer("previous_position"),
    url: text("url").notNull().default(""),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_domain_research_tracked_domain_market_kw").on(
      table.linkedDomainId,
      table.locationCode,
      table.languageCode,
      table.keyword,
      table.device,
    ),
    index("idx_domain_research_tracked_org").on(table.organizationId),
    index("idx_domain_research_tracked_domain").on(table.linkedDomainId),
  ],
);

/**
 * Historical rank-check observations for a tracked keyword.
 */
export const domainResearchRankSnapshots = pgTable(
  "domain_research_rank_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trackedKeywordId: uuid("tracked_keyword_id")
      .notNull()
      .references(() => domainResearchTrackedKeywords.id, { onDelete: "cascade" }),
    position: integer("position"),
    url: text("url").notNull().default(""),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_domain_research_rank_snapshots_tracked").on(table.trackedKeywordId)],
);

/**
 * Latest live SERP snapshot for a keyword + market.
 */
export const domainResearchSerpSnapshots = pgTable(
  "domain_research_serp_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkedDomainId: uuid("linked_domain_id")
      .notNull()
      .references(() => linkedDomains.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    results: jsonb("results").$type<DomainResearchSerpSnapshotRow[]>().notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_domain_research_serp_domain_market_kw").on(
      table.linkedDomainId,
      table.locationCode,
      table.languageCode,
      table.keyword,
    ),
    index("idx_domain_research_serp_domain").on(table.linkedDomainId),
  ],
);

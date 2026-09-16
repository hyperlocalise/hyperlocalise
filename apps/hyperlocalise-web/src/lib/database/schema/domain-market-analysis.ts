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
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { DomainMarketAnalysisResult } from "@/lib/domains/domain-market-analysis";

export const domainMarketAnalysisCache = pgTable("domain_market_analysis_cache", {
  domainKey: text("domain_key").primaryKey(),
  analysis: jsonb("analysis").$type<DomainMarketAnalysisResult>().notNull(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

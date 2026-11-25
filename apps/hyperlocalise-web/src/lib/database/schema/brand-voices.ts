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
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./organizations";

/**
 * A workspace's own speech voices, the first part of its brand kit.
 *
 * Every workspace shares one provider account, so a voice belongs to the
 * workspace only through this row: go-svc resolves `id` or `name_key` to
 * `provider_voice_id` for the workspace's members, and refuses another
 * workspace's provider voice id outright. Archived rows keep that refusal
 * and the consent record after the provider voice is deleted.
 */
export const brandVoices = pgTable(
  "brand_voices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    /** Lower case letters and digits of `name`; how a request names the voice. */
    nameKey: text("name_key").notNull(),
    description: text("description").notNull().default(""),
    /** `elevenlabs` for now. */
    provider: text("provider").notNull(),
    providerVoiceId: text("provider_voice_id").notNull(),
    /** `clone` from recordings of a speaker, or `design` from a description. */
    source: text("source").notNull(),
    labels: jsonb("labels").$type<Record<string, string>>().notNull().default({}),
    language: text("language"),
    /** SHA-256 ids of the uploaded recordings a clone was made from. */
    sampleAssetIds: text("sample_asset_ids").array().notNull().default([]),
    /** Who attested that the speaker agreed to be cloned, when, and to which wording. */
    consentByUserId: uuid("consent_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    consentVersion: text("consent_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("brand_voices_org_name_key_active_key")
      .on(table.organizationId, table.nameKey)
      .where(sql`${table.archivedAt} IS NULL`),
    uniqueIndex("brand_voices_provider_voice_id_key").on(table.provider, table.providerVoiceId),
    index("idx_brand_voices_org_created_at").on(table.organizationId, table.createdAt),
    check("brand_voices_source_check", sql`${table.source} IN ('clone', 'design')`),
    check(
      "brand_voices_clone_consent_check",
      sql`${table.source} <> 'clone' OR (${table.consentedAt} IS NOT NULL AND ${table.consentVersion} IS NOT NULL)`,
    ),
  ],
);

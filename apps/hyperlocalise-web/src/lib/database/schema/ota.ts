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

import { otaDistributionFormatEnum } from "./enums";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

export type OtaDistributionFormat = (typeof otaDistributionFormatEnum.enumValues)[number];

/**
 * Crowdin-shaped manifest snapshot written at release time. Serving and CDN
 * upload fill `content` later; persistence stores whatever the writer records.
 * `format` is copied from the distribution so a later format change cannot
 * rewrite an already-released artifact contract.
 */
export type OtaManifestSnapshot = {
  files: string[];
  languages: string[];
  content: Record<string, string[]>;
  timestamp: number;
  format: OtaDistributionFormat;
};

/**
 * Native-project OTA distribution. The public hash is the unguessable CDN
 * address. Revoking sets `revoked_at` and keeps the row.
 */
export const otaDistributions = pgTable(
  "ota_distributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // 16 random bytes as lowercase hex. Unique and not derived from project id or name.
    publicHash: text("public_hash").notNull(),
    fileIds: jsonb("file_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    locales: jsonb("locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    format: otaDistributionFormatEnum("format").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Null means the distribution may still be served. Set to stop serving without deleting.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("ota_distributions_public_hash_key").on(table.publicHash),
    index("idx_ota_distributions_project_id").on(table.projectId),
    index("idx_ota_distributions_org").on(table.organizationId),
    index("idx_ota_distributions_project_revoked").on(table.projectId, table.revokedAt),
    check(
      "ota_distributions_public_hash_format_check",
      sql`${table.publicHash} ~ '^[0-9a-f]{32}$'`,
    ),
    check("ota_distributions_name_not_blank_check", sql`char_length(btrim(${table.name})) > 0`),
  ],
);

/**
 * Immutable release of a distribution. Sequence is monotonic per distribution.
 * Artifact bytes are a later ticket; this row holds the pointer and manifest.
 */
export const otaReleases = pgTable(
  "ota_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    distributionId: uuid("distribution_id")
      .notNull()
      .references(() => otaDistributions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    // Storage key, stored-file id, or CDN object path. Null until upload lands.
    artifactPointer: text("artifact_pointer"),
    manifest: jsonb("manifest").$type<OtaManifestSnapshot>().notNull(),
    releasedByUserId: uuid("released_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ota_releases_distribution_sequence_key").on(table.distributionId, table.sequence),
    index("idx_ota_releases_distribution_released_at").on(table.distributionId, table.releasedAt),
    index("idx_ota_releases_org").on(table.organizationId),
    check("ota_releases_sequence_check", sql`${table.sequence} >= 1`),
  ],
);

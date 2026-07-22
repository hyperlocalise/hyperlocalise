/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

/**
 * Stores Crowdin App install credentials from installed/uninstall events.
 * Separate from TMS credentials; used for Crowdin App JWT/install lifecycle.
 */
export const crowdinAppInstallations = pgTable(
  "crowdin_app_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    crowdinOrganizationId: integer("crowdin_organization_id").notNull(),
    crowdinDomain: text("crowdin_domain"),
    crowdinBaseUrl: text("crowdin_base_url").notNull(),
    crowdinUserId: integer("crowdin_user_id").notNull(),
    appId: text("app_id").notNull(),
    appSecretEncryptionAlgorithm: text("app_secret_encryption_algorithm").notNull(),
    appSecretCiphertext: text("app_secret_ciphertext").notNull(),
    appSecretIv: text("app_secret_iv").notNull(),
    appSecretAuthTag: text("app_secret_auth_tag").notNull(),
    appSecretKeyVersion: integer("app_secret_key_version").notNull().default(1),
    /**
     * Optional Hyperlocalise org link when install can be correlated to a TMS credential.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("crowdin_app_installations_crowdin_org_key").on(table.crowdinOrganizationId),
    index("idx_crowdin_app_installations_organization").on(table.organizationId),
  ],
);

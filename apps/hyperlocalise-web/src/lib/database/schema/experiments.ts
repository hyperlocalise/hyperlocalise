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
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { experimentFlagKindEnum, experimentKindEnum, experimentStatusEnum } from "./enums";
import { organizations, users } from "./organizations";

export type ExperimentCriterionMatch =
  | "exact"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_null"
  | "is_not_null"
  | "in"
  | "contains_substring"
  | "contains_any"
  | "contains_substring_any";

export type ExperimentCriterionLogicalNode = {
  type: "and" | "or" | "not";
  children: ExperimentCriterionNode[];
};

export type ExperimentCriterionAttributeNode = {
  type: "attribute";
  name: string;
  match: ExperimentCriterionMatch;
  value?: string | number | boolean | string[];
};

export type ExperimentCriterionNode =
  | ExperimentCriterionLogicalNode
  | ExperimentCriterionAttributeNode;

/**
 * Org-scoped flag definitions. Keys are unique per workspace and URL-safe.
 */
export const experimentFlags = pgTable(
  "experiment_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    description: text("description"),
    kind: experimentFlagKindEnum("kind").notNull().default("experiment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("experiment_flags_org_key_key").on(table.organizationId, table.key),
    index("idx_experiment_flags_org_kind").on(table.organizationId, table.kind),
  ],
);

/**
 * JSON value for config flags. One row per flag.
 */
export const experimentFlagConfigs = pgTable(
  "experiment_flag_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => experimentFlags.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [uniqueIndex("experiment_flag_configs_flag_id_key").on(table.flagId)],
);

/**
 * Audience definitions. Criterion trees are evaluated against OFREP context.
 */
export const experimentAudiences = pgTable(
  "experiment_audiences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    criterion: jsonb("criterion").$type<ExperimentCriterionNode>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_experiment_audiences_org").on(table.organizationId)],
);

/**
 * Named rollouts that assign visitors to variants.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: experimentStatusEnum("status").notNull().default("draft"),
    kind: experimentKindEnum("kind").notNull().default("toggle"),
    audienceId: uuid("audience_id").references(() => experimentAudiences.id, {
      onDelete: "set null",
    }),
    rolloutPercentage: integer("rollout_percentage").notNull().default(10000),
    seed: integer("seed").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_experiments_org_status").on(table.organizationId, table.status),
    index("idx_experiments_org_window").on(table.organizationId, table.startAt, table.endAt),
    index("idx_experiments_audience_id").on(table.audienceId),
    check(
      "experiments_rollout_percentage_check",
      sql`${table.rolloutPercentage} >= 0 AND ${table.rolloutPercentage} <= 10000`,
    ),
  ],
);

/**
 * Variants inside an experiment. Optional per-variant audience overrides the experiment audience.
 */
export const experimentVariants = pgTable(
  "experiment_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    audienceId: uuid("audience_id").references(() => experimentAudiences.id, {
      onDelete: "set null",
    }),
    rolloutPercentage: integer("rollout_percentage").notNull().default(10000),
    isControl: boolean("is_control").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("experiment_variants_experiment_key_key").on(table.experimentId, table.key),
    index("idx_experiment_variants_experiment_id").on(table.experimentId),
    index("idx_experiment_variants_audience_id").on(table.audienceId),
    check(
      "experiment_variants_rollout_percentage_check",
      sql`${table.rolloutPercentage} >= 0 AND ${table.rolloutPercentage} <= 10000`,
    ),
  ],
);

/**
 * Bucket ranges (0-9999) assigned to a variant after rollout math.
 */
export const experimentAllocations = pgTable(
  "experiment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => experimentVariants.id, { onDelete: "cascade" }),
    start: integer("start").notNull().default(0),
    end: integer("end").notNull().default(9999),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_experiment_allocations_variant_id").on(table.variantId),
    index("idx_experiment_allocations_range").on(table.start, table.end),
    check(
      "experiment_allocations_range_check",
      sql`${table.start} >= 0 AND ${table.end} <= 9999 AND ${table.start} <= ${table.end}`,
    ),
  ],
);

/**
 * Attaches a flag to a variant with an enabled bit and optional JSON payload.
 */
export const experimentFlagAssignments = pgTable(
  "experiment_flag_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => experimentFlags.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => experimentVariants.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    payload: jsonb("payload").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("experiment_flag_assignments_flag_variant_key").on(table.flagId, table.variantId),
    index("idx_experiment_flag_assignments_flag_id").on(table.flagId),
    index("idx_experiment_flag_assignments_variant_id").on(table.variantId),
  ],
);

/**
 * Publishable OFREP credentials. The secret is stored as a SHA-256 hash.
 */
export const experimentClientKeys = pgTable(
  "experiment_client_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("experiment_client_keys_key_hash_key").on(table.keyHash),
    index("idx_experiment_client_keys_org").on(table.organizationId),
  ],
);

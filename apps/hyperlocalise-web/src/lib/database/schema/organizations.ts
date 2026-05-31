import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  organizationLifecycleStatusEnum,
  organizationMembershipRoleEnum,
  teamMembershipRoleEnum,
} from "./enums";

/**
 * Stores tenant workspaces synchronized with WorkOS. Each row is the root owner for projects, teams, credentials, jobs, assets, files, and provider state.
 */
export const organizations = pgTable(
  "organizations",
  {
    // Internal stable organization identifier used across domain tables.
    id: uuid("id").defaultRandom().primaryKey(),
    // Upstream WorkOS organization identifier retained for provider sync.
    workosOrganizationId: text("workos_organization_id").notNull(),
    // Display name cached locally so reads do not depend on WorkOS availability.
    name: text("name").notNull(),
    // Optional human-readable slug for URLs and future workspace routing.
    slug: text("slug"),
    // App-local lifecycle (WorkOS owns identity). archived = soft-deleted workspace;
    // deprecated = legacy rows with synthetic local_org_* WorkOS ids (migration only).
    lifecycleStatus: organizationLifecycleStatusEnum("lifecycle_status")
      .notNull()
      .default("active"),
    // Timestamp for soft-deleted workspaces. Hard delete remains unsupported.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // When the organization record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When organization metadata was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organizations_workos_organization_id_key").on(table.workosOrganizationId),
    uniqueIndex("organizations_slug_key").on(table.slug),
    index("idx_organizations_created_at").on(table.createdAt),
  ],
);

/**
 * Stores app-local user identities mirrored from WorkOS. User rows provide stable foreign keys for memberships, authorship, credentials, jobs, uploads, and audit records.
 */
export const users = pgTable(
  "users",
  {
    // Internal stable user identifier referenced by domain records.
    id: uuid("id").defaultRandom().primaryKey(),
    // Upstream WorkOS user identifier retained for provider sync.
    workosUserId: text("workos_user_id").notNull(),
    // Unique email address cached locally for lookup and auditing.
    email: text("email").notNull(),
    // Optional profile fields mirrored from WorkOS.
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatarUrl: text("avatar_url"),
    // Last successful WorkOS organization-membership reconciliation for this user.
    workosMembershipsReconciledAt: timestamp("workos_memberships_reconciled_at", {
      withTimezone: true,
    }),
    // When the user record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When user metadata was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_workos_user_id_key").on(table.workosUserId),
    uniqueIndex("users_email_key").on(sql`lower(${table.email})`),
    index("idx_users_created_at").on(table.createdAt),
  ],
);

/**
 * Connects users to organizations with app-level roles and optional WorkOS membership identifiers. This table is the workspace authorization boundary.
 */
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    // Internal stable membership identifier used for application-level auditing.
    id: uuid("id").defaultRandom().primaryKey(),
    // Organization membership belongs to.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // User who belongs to the organization.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Upstream WorkOS membership identifier retained for provider sync.
    workosMembershipId: text("workos_membership_id"),
    // App-level role used for authorization decisions.
    role: organizationMembershipRoleEnum("role").notNull().default("member"),
    // When the membership record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When membership metadata was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_memberships_org_user_key").on(table.organizationId, table.userId),
    uniqueIndex("organization_memberships_workos_membership_id_key").on(table.workosMembershipId),
    index("idx_organization_memberships_user_id").on(table.userId),
  ],
);

/**
 * Stores organization-scoped teams used to group users and own projects. Teams provide a narrower access boundary inside a workspace.
 */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("teams_org_slug_key").on(table.organizationId, table.slug),
    index("idx_teams_org_created_at").on(table.organizationId, table.createdAt),
  ],
);

/**
 * Connects users to teams with team-specific roles. These rows drive team-scoped project visibility and delegated team management.
 */
export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamMembershipRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("team_memberships_team_user_key").on(table.teamId, table.userId),
    index("idx_team_memberships_user_id").on(table.userId),
  ],
);

import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  sql,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const translationJobTypeEnum = pgEnum("translation_job_type", ["string", "file"]);
export const translationJobStatusEnum = pgEnum("translation_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);
export const translationJobOutcomeKindEnum = pgEnum("translation_job_outcome_kind", [
  "string_result",
  "file_result",
  "error",
]);
export const organizationMembershipRoleEnum = pgEnum("organization_membership_role", [
  "owner",
  "admin",
  "member",
]);

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

export const translationProjects = pgTable(
  "translation_projects",
  {
    // Stable project identifier used by jobs and future translation assets.
    id: text("id").primaryKey(),
    // Tenant that owns this project, stored as an internal organization ID.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // User who created the project, stored as an internal user ID.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Human-readable project name shown in app lists and settings.
    name: text("name").notNull(),
    // Optional long-form description for operator context.
    description: text("description").notNull().default(""),
    // Shared project-level translation guidance injected into job execution.
    translationContext: text("translation_context").notNull().default(""),
    // When the project record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When project metadata was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_translation_projects_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_translation_projects_created_by_user_id").on(table.createdByUserId),
  ],
);

export const translationJobs = pgTable(
  "translation_jobs",
  {
    // Stable job identifier returned to clients and used for status lookups.
    id: text("id").primaryKey(),
    // Parent project that owns the translation request.
    projectId: text("project_id")
      .notNull()
      .references(() => translationProjects.id, { onDelete: "cascade" }),
    // User who triggered the job, stored as an internal user ID.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // High-level job category; currently string and file jobs are supported.
    type: translationJobTypeEnum("type").notNull(),
    // App-level lifecycle state mirrored into Postgres for UI/API reads.
    status: translationJobStatusEnum("status").notNull(),
    // Canonical job input stored as domain data, not workflow engine state.
    inputPayload: jsonb("input_payload").$type<unknown>().notNull(),
    // Describes the shape of a successful result or terminal error payload.
    outcomeKind: translationJobOutcomeKindEnum("outcome_kind"),
    // Terminal job output persisted for retrieval after execution completes.
    outcomePayload: jsonb("outcome_payload").$type<unknown | null>(),
    // Last human-readable failure message captured for debugging and UI display.
    lastError: text("last_error"),
    // External workflow execution reference for tracing across orchestration systems.
    workflowRunId: text("workflow_run_id"),
    // When the job record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When job state last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    // When the job entered a terminal state, if it has completed.
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_translation_jobs_project_created_at").on(table.projectId, table.createdAt),
    index("idx_translation_jobs_created_by_user_id").on(table.createdByUserId),
    index("idx_translation_jobs_workflow_run_id").on(table.workflowRunId),
  ],
);

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bigintText } from "./core";
import { organizations, users } from "./organizations";

/**
 * Stores the GitHub App installation linked to an organization, including provider identifiers and account metadata used for repository sync and automation.
 */
export const githubInstallations = pgTable(
  "github_installations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubInstallationId: bigintText("github_installation_id").notNull(),
    githubAppId: bigintText("github_app_id").notNull(),
    accountLogin: text("account_login"),
    accountType: text("account_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("github_installations_organization_id_key").on(table.organizationId),
    uniqueIndex("github_installations_github_installation_id_key").on(table.githubInstallationId),
    index("idx_github_installations_created_at").on(table.createdAt),
  ],
);

/**
 * Stores short-lived GitHub installation OAuth state nonces so setup callbacks can be verified, scoped to the initiating organization and user, and consumed once.
 */
export const githubInstallationStates = pgTable(
  "github_installation_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nonce: text("nonce").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("github_installation_states_nonce_key").on(table.nonce),
    index("idx_github_installation_states_org_user").on(table.organizationId, table.userId),
    index("idx_github_installation_states_expires_at").on(table.expiresAt),
  ],
);

/**
 * Stores short-lived Slack installation state nonces so Slack setup callbacks can be verified, scoped to the initiating organization and user, and consumed once.
 */
export const slackInstallationStates = pgTable(
  "slack_installation_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nonce: text("nonce").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("slack_installation_states_nonce_key").on(table.nonce),
    index("idx_slack_installation_states_org_user").on(table.organizationId, table.userId),
    index("idx_slack_installation_states_expires_at").on(table.expiresAt),
  ],
);

/**
 * Stores repositories visible through a GitHub installation, including repository identifiers, names, default branch, enabled state, and sync timestamps.
 */
export const githubInstallationRepositories = pgTable(
  "github_installation_repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubInstallationId: bigintText("github_installation_id").notNull(),
    githubRepositoryId: bigintText("github_repository_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    private: boolean("private").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    defaultBranch: text("default_branch"),
    enabled: boolean("enabled").notNull().default(false),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("github_installation_repositories_github_repository_id_key").on(
      table.githubInstallationId,
      table.githubRepositoryId,
    ),
    index("idx_github_installation_repositories_org").on(table.organizationId),
    index("idx_github_installation_repositories_installation").on(table.githubInstallationId),
    index("idx_github_installation_repositories_org_enabled").on(
      table.organizationId,
      table.enabled,
    ),
  ],
);

/**
 * Stores idempotency records for GitHub-triggered agent requests, preventing duplicate processing of the same comment, pull request, and scoped request.
 */
export const githubAgentRequests = pgTable(
  "github_agent_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestKind: text("request_kind").notNull(),
    githubInstallationId: bigintText("github_installation_id").notNull(),
    repositoryFullName: text("repository_full_name").notNull(),
    pullRequestNumber: integer("pull_request_number").notNull(),
    commentId: bigintText("comment_id").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    status: text("status").notNull().default("claimed"),
    workflowRunIds: jsonb("workflow_run_ids").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("github_agent_requests_idempotency_key").on(
      table.requestKind,
      table.githubInstallationId,
      table.repositoryFullName,
      table.pullRequestNumber,
      table.commentId,
      table.scopeKey,
    ),
    index("idx_github_agent_requests_installation_repo").on(
      table.githubInstallationId,
      table.repositoryFullName,
    ),
    index("idx_github_agent_requests_created_at").on(table.createdAt),
  ],
);

/**
 * Stores per-repository automation configuration and scheduling state for GitHub localization workflows.
 */
export const githubRepositoryAutomationSettings = pgTable(
  "github_repository_automation_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubInstallationRepositoryId: uuid("github_installation_repository_id")
      .notNull()
      .references(() => githubInstallationRepositories.id, { onDelete: "cascade" }),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    configVersion: integer("config_version").notNull().default(1),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("github_repository_automation_settings_repo_key").on(
      table.githubInstallationRepositoryId,
    ),
    index("idx_github_repository_automation_settings_org").on(table.organizationId),
    index("idx_github_repository_automation_settings_next_run").on(table.nextRunAt),
  ],
);

/**
 * Tracks scheduled or push-triggered GitHub repository automation jobs through queueing, execution, success, failure, and skip outcomes.
 */
export const githubRepositoryAutomationJobStatusEnum = pgEnum(
  "github_repository_automation_job_status",
  ["queued", "running", "succeeded", "failed", "skipped"],
);

/**
 * Records whether a GitHub repository automation job was created from a push event or a scheduled run.
 */
export const githubRepositoryAutomationJobTriggerModeEnum = pgEnum(
  "github_repository_automation_job_trigger_mode",
  ["push", "scheduled"],
);

/**
 * Stores concrete GitHub repository automation runs, including trigger metadata, workflow flags, status, check-run identifiers, result summary, and errors.
 */
export const githubRepositoryAutomationJobs = pgTable(
  "github_repository_automation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubInstallationRepositoryId: uuid("github_installation_repository_id")
      .notNull()
      .references(() => githubInstallationRepositories.id, { onDelete: "cascade" }),
    githubInstallationId: bigintText("github_installation_id").notNull(),
    githubRepositoryId: bigintText("github_repository_id").notNull(),
    configVersion: integer("config_version").notNull(),
    triggerMode: githubRepositoryAutomationJobTriggerModeEnum("trigger_mode").notNull(),
    status: githubRepositoryAutomationJobStatusEnum("status").notNull().default("queued"),
    skipReason: text("skip_reason"),
    triggerBranch: text("trigger_branch"),
    commitBefore: text("commit_before"),
    commitAfter: text("commit_after"),
    workflows: jsonb("workflows")
      .$type<{
        pushSource: boolean;
        pullTranslations: boolean;
        validation: boolean;
        validationBlockOnFailure?: boolean;
        statusCheck?: {
          enabled?: boolean;
          mode?: "advisory" | "blocking";
        };
      }>()
      .notNull()
      .default(sql`'{"pushSource":false,"pullTranslations":false,"validation":false}'::jsonb`),
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>(),
    githubDeliveryId: text("github_delivery_id"),
    scheduledRunAt: timestamp("scheduled_run_at", { withTimezone: true }),
    workflowRunId: text("workflow_run_id"),
    githubCheckRunId: bigintText("github_check_run_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("github_repository_automation_jobs_idempotency_key").on(table.idempotencyKey),
    index("idx_github_repository_automation_jobs_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_github_repository_automation_jobs_repo_created").on(
      table.githubInstallationRepositoryId,
      table.createdAt,
    ),
    index("idx_github_repository_automation_jobs_status").on(table.status),
  ],
);

/**
 * Summarizes per-commit automation validation results so repositories can distinguish skipped, passing, warning, failed, and errored checks.
 */
export const githubRepositoryAutomationCommitResultStatusEnum = pgEnum(
  "github_repository_automation_commit_result_status",
  ["skipped", "passed", "warning", "failed", "error"],
);

/**
 * Stores per-commit results produced by repository automation jobs, including changed paths, validation reports, suggested fixes, logs, and status.
 */
export const githubRepositoryAutomationCommitResults = pgTable(
  "github_repository_automation_commit_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => githubRepositoryAutomationJobs.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    parentCommitSha: text("parent_commit_sha"),
    status: githubRepositoryAutomationCommitResultStatusEnum("status").notNull(),
    skipReason: text("skip_reason"),
    changedPaths: jsonb("changed_paths")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    hlCheckReport: jsonb("hl_check_report").$type<Record<string, unknown>>(),
    agentSummary: text("agent_summary"),
    suggestedFixes: jsonb("suggested_fixes").$type<Record<string, unknown>[]>(),
    logUrl: text("log_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("github_repository_automation_commit_results_job_commit").on(
      table.jobId,
      table.commitSha,
    ),
    index("idx_github_repository_automation_commit_results_job").on(table.jobId),
  ],
);

/**
 * Stores GitHub i18n setup attempts initiated by users, including repository identity, base branch, status, detected locale count, workflow run, and pull request output.
 */
export const githubI18nSetupRuns = pgTable(
  "github_i18n_setup_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    githubInstallationId: bigintText("github_installation_id").notNull(),
    githubRepositoryId: bigintText("github_repository_id").notNull(),
    repositoryFullName: text("repository_full_name").notNull(),
    baseBranch: text("base_branch").notNull(),
    status: text("status").notNull().default("queued"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    pullRequestUrl: text("pull_request_url"),
    pullRequestNumber: integer("pull_request_number"),
    detectedLocaleCount: integer("detected_locale_count"),
    workflowRunId: text("workflow_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_github_i18n_setup_runs_org_repo").on(table.organizationId, table.githubRepositoryId),
    index("idx_github_i18n_setup_runs_status").on(table.status),
    index("idx_github_i18n_setup_runs_created_at").on(table.createdAt),
  ],
);

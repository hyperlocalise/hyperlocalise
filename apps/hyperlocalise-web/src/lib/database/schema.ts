import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
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

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

const bigintText = customType<{ data: string; driverData: string | number }>({
  dataType() {
    return "bigint";
  },
  fromDriver(value) {
    return String(value);
  },
  toDriver(value) {
    return value;
  },
});

// Lexical full-text search is a good default for glossary and TM lookup.
// It will miss semantically similar phrasing with low token overlap; if that becomes a real issue,
// the next step is adding embedding-backed retrieval alongside these search vectors rather than replacing them.
//
// Example future pgvector shape:
//   1. Enable the extension in a migration:
//      CREATE EXTENSION IF NOT EXISTS vector;
//   2. Add an embedding column such as:
//      embedding vector(1536)
//   3. Add an ANN index such as:
//      CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);
//   4. Query with hybrid ranking, for example lexical filtering plus cosine-distance ordering.

export const jobKindEnum = pgEnum("job_kind", [
  "translation",
  "research",
  "review",
  "sync",
  "asset_management",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "waiting_for_review",
  "cancelled",
]);
export const translationJobTypeEnum = pgEnum("translation_job_type", ["string", "file"]);
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
export const teamMembershipRoleEnum = pgEnum("team_membership_role", ["manager", "member"]);
export const assetStatusEnum = pgEnum("asset_status", ["draft", "active", "archived"]);
export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
]);
export const interactionSourceEnum = pgEnum("interaction_source", [
  "chat_ui",
  "email_agent",
  "github_agent",
]);
export const inboxStatusEnum = pgEnum("inbox_status", ["active", "archived"]);
export const messageSenderTypeEnum = pgEnum("message_sender_type", ["user", "agent"]);

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

export const projects = pgTable(
  "projects",
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
    uniqueIndex("projects_id_organization_id_key").on(table.id, table.organizationId),
    index("idx_projects_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_projects_created_by_user_id").on(table.createdByUserId),
  ],
);

export const glossaries = pgTable(
  "glossaries",
  {
    // Stable glossary identifier for reusable terminology libraries.
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant that owns this glossary library.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // User who created the glossary, if known.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Human-readable glossary name displayed in settings and attach flows.
    name: text("name").notNull(),
    // Optional operator-facing summary for the glossary.
    description: text("description").notNull().default(""),
    // Locale pair that the glossary terms apply to.
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    // Lifecycle state for draft, active, and archived libraries.
    status: assetStatusEnum("status").notNull().default("active"),
    // When the glossary was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When glossary metadata last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("glossaries_id_organization_id_key").on(table.id, table.organizationId),
    index("idx_glossaries_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_glossaries_org_locale_pair").on(
      table.organizationId,
      table.sourceLocale,
      table.targetLocale,
    ),
    index("idx_glossaries_created_by_user_id").on(table.createdByUserId),
  ],
);

export const glossaryTerms = pgTable(
  "glossary_terms",
  {
    // Stable glossary term identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Parent glossary library that owns the term.
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => glossaries.id, { onDelete: "cascade" }),
    // Source-side term to match against translation input.
    sourceTerm: text("source_term").notNull(),
    // Preferred target-side rendering for the source term.
    targetTerm: text("target_term").notNull(),
    // Optional human-readable explanation for reviewers and prompts.
    description: text("description").notNull().default(""),
    // Optional grammatical hint for the term.
    partOfSpeech: text("part_of_speech").notNull().default(""),
    // Whether source term matching should preserve case sensitivity.
    caseSensitive: boolean("case_sensitive").notNull().default(false),
    // Whether the source term is explicitly forbidden in output.
    forbidden: boolean("forbidden").notNull().default(false),
    // Review status for agent suggestions vs human-approved terms.
    reviewStatus: text("review_status").notNull().default("approved"),
    // Extensible metadata for tags, domains, or import provenance.
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Generated Postgres full-text document used for fast lexical glossary retrieval.
    // `to_tsvector` lowercases tokens, so callers must still post-filter case-sensitive terms.
    searchVector: tsvector("search_vector").generatedAlwaysAs(sql`
      setweight(to_tsvector('simple', coalesce(source_term, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(target_term, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(description, '')), 'C')
    `),
    // When the glossary term was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the glossary term last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("glossary_terms_glossary_source_term_key").on(table.glossaryId, table.sourceTerm),
    uniqueIndex("glossary_terms_glossary_source_term_ci_key")
      .on(table.glossaryId, sql`lower(${table.sourceTerm})`)
      .where(sql`${table.caseSensitive} = false`),
    index("idx_glossary_terms_glossary_created_at").on(table.glossaryId, table.createdAt),
    index("idx_glossary_terms_search_vector").using("gin", table.searchVector),
  ],
);

export const memories = pgTable(
  "memories",
  {
    // Stable remote cache container identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant that owns this TM library.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // User who created the TM, if known.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Human-readable name for UI and attach flows.
    name: text("name").notNull(),
    // Optional description of the TM source and intended usage.
    description: text("description").notNull().default(""),
    // Lifecycle state for the TM library.
    status: assetStatusEnum("status").notNull().default("active"),
    // When the TM was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When TM metadata last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("memories_id_organization_id_key").on(table.id, table.organizationId),
    index("idx_memories_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_memories_created_by_user_id").on(table.createdByUserId),
  ],
);

export const memoryEntries = pgTable(
  "memory_entries",
  {
    // Stable TM entry identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Parent TM container that owns the entry.
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    // Locale pair captured by this aligned translation example.
    sourceLocale: text("source_locale").notNull(),
    targetLocale: text("target_locale").notNull(),
    // Original source string stored for exact or fuzzy lookup.
    sourceText: text("source_text").notNull(),
    // Normalized source text used for deterministic uniqueness and search.
    // Compute this with `normalizeTranslationMemorySourceText()` so every write path dedupes identically.
    normalizedSourceText: text("normalized_source_text").notNull(),
    // Previously accepted translation for the source string.
    targetText: text("target_text").notNull(),
    // Optional quality hint for ranking entries, expressed as 0-100.
    matchScore: integer("match_score").notNull().default(100),
    // Optional source label such as import, manual, or sync.
    provenance: text("provenance").notNull().default("manual"),
    // Optional external identifier retained for later sync or dedupe.
    externalKey: text("external_key"),
    // Review status for agent suggestions vs human-approved entries.
    reviewStatus: text("review_status").notNull().default("approved"),
    // Extensible metadata for import payloads or audit tags.
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Generated Postgres full-text document used for fast lexical TM retrieval.
    searchVector: tsvector("search_vector").generatedAlwaysAs(sql`
      setweight(to_tsvector('simple', coalesce(source_text, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(target_text, '')), 'B')
    `),
    // When the TM entry was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the TM entry last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check(
      "memory_entries_match_score_check",
      sql`${table.matchScore} >= 0 AND ${table.matchScore} <= 100`,
    ),
    uniqueIndex("memory_entries_memory_locale_source_key").on(
      table.memoryId,
      table.sourceLocale,
      table.targetLocale,
      table.normalizedSourceText,
    ),
    index("idx_memory_entries_memory_locale_pair").on(
      table.memoryId,
      table.sourceLocale,
      table.targetLocale,
    ),
    index("idx_memory_entries_external_key").on(table.externalKey),
    index("idx_memory_entries_search_vector").using("gin", table.searchVector),
  ],
);

export const projectGlossaries = pgTable(
  "project_glossaries",
  {
    // Stable identifier for a project-to-glossary attachment.
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant shared by the project and attached glossary.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Project receiving the reusable glossary library.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Attached glossary library.
    glossaryId: uuid("glossary_id").notNull(),
    // Lower values can be loaded earlier during runtime assembly.
    priority: integer("priority").notNull().default(0),
    // When the attachment was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the attachment last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_glossaries_project_glossary_key").on(table.projectId, table.glossaryId),
    index("idx_project_glossaries_org").on(table.organizationId),
    index("idx_project_glossaries_project_priority").on(table.projectId, table.priority),
  ],
);

export const projectMemories = pgTable(
  "project_memories",
  {
    // Stable identifier for a project-to-TM attachment.
    id: uuid("id").defaultRandom().primaryKey(),
    // Tenant shared by the project and attached TM.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Project receiving the reusable TM library.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Attached remote cache library.
    memoryId: uuid("memory_id").notNull(),
    // Lower values can be searched earlier at runtime.
    priority: integer("priority").notNull().default(0),
    // When the attachment was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the attachment last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_memories_project_memory_key").on(table.projectId, table.memoryId),
    index("idx_project_memories_org").on(table.organizationId),
    index("idx_project_memories_project_priority").on(table.projectId, table.priority),
  ],
);

export const organizationLlmProviderCredentials = pgTable(
  "organization_llm_provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    provider: llmProviderEnum("provider").notNull(),
    defaultModel: text("default_model").notNull(),
    maskedApiKeySuffix: text("masked_api_key_suffix").notNull(),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_llm_provider_credentials_org_provider_key").on(
      table.organizationId,
      table.provider,
    ),
    index("idx_organization_llm_provider_credentials_updated_at").on(table.updatedAt),
  ],
);

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

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("connectors_org_kind_key").on(table.organizationId, table.kind),
    index("idx_connectors_org").on(table.organizationId),
  ],
);

export const tmsLinks = pgTable(
  "tms_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    externalAccountId: text("external_account_id"),
    externalProjectId: text("external_project_id"),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_tms_links_org").on(table.organizationId),
    index("idx_tms_links_org_provider").on(table.organizationId, table.provider),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    // Stable job identifier returned to clients and used for status lookups.
    id: text("id").primaryKey(),
    // Tenant that owns this job, stored directly for workspace-level job queries.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Optional project context. Some jobs are workspace-level rather than project-level.
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    // User who triggered the job, stored as an internal user ID.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Owner assigned for review or human oversight.
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    // High-level job category used by routing, workers, and workspace job lists.
    kind: jobKindEnum("kind").notNull(),
    // App-level lifecycle state mirrored into Postgres for UI/API reads.
    status: jobStatusEnum("status").notNull().default("queued"),
    // Canonical job input stored as domain data, not workflow engine state.
    inputPayload: jsonb("input_payload").$type<unknown>().notNull(),
    // Terminal job output persisted for retrieval after execution completes.
    outcomePayload: jsonb("outcome_payload").$type<unknown>(),
    // Last human-readable failure message captured for debugging and UI display.
    lastError: text("last_error"),
    // External workflow execution reference for tracing across orchestration systems.
    workflowRunId: text("workflow_run_id"),
    // Link back to the interaction that created this job, for Inbox display.
    interactionId: uuid("interaction_id").references(() => interactions.id, {
      onDelete: "set null",
    }),
    // Explicit inspectable context packet assembled before execution.
    contextSnapshot: jsonb("context_snapshot")
      .$type<unknown>()
      .default(sql`'{}'::jsonb`),
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
    index("idx_jobs_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_jobs_project_created_at").on(table.projectId, table.createdAt),
    index("idx_jobs_created_by_user_id").on(table.createdByUserId),
    index("idx_jobs_owner_user_id").on(table.ownerUserId),
    index("idx_jobs_kind_status").on(table.kind, table.status),
    index("idx_jobs_workflow_run_id").on(table.workflowRunId),
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_interaction").on(table.interactionId),
  ],
);

export const translationJobDetails = pgTable(
  "translation_job_details",
  {
    // One-to-one extension row for jobs whose kind is "translation".
    jobId: text("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // Translation subtype; string jobs are supported first, file jobs can follow.
    type: translationJobTypeEnum("type").notNull(),
    // Describes the shape of a successful translation result or terminal error payload.
    outcomeKind: translationJobOutcomeKindEnum("outcome_kind"),
  },
  (table) => [
    index("idx_translation_job_details_type").on(table.type),
    index("idx_translation_job_details_outcome_kind").on(table.outcomeKind),
  ],
);

export const reviewJobDetails = pgTable("review_job_details", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  criteria: text("criteria").notNull().default(""),
  targetLocale: text("target_locale"),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

export const syncJobDetails = pgTable("sync_job_details", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  connectorKind: text("connector_kind").notNull(),
  direction: text("direction").notNull(),
  externalIdentifiers: jsonb("external_identifiers")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

export const assetManagementJobDetails = pgTable("asset_management_job_details", {
  jobId: text("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  assetType: text("asset_type").notNull(),
  operation: text("operation").notNull(),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
});

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    source: interactionSourceEnum("source").notNull(),
    title: text("title").notNull(),
    sourceThreadId: text("source_thread_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("interactions_id_organization_id_key").on(table.id, table.organizationId),
    uniqueIndex("interactions_org_source_thread_id_key")
      .on(table.organizationId, table.source, table.sourceThreadId)
      .where(sql`${table.sourceThreadId} IS NOT NULL`),
    index("idx_interactions_org_last_message").on(table.organizationId, table.lastMessageAt),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    interactionId: uuid("interaction_id")
      .primaryKey()
      .references(() => interactions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: inboxStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_inbox_items_org_status").on(table.organizationId, table.status),
    index("idx_inbox_items_org_updated").on(table.organizationId, table.updatedAt),
  ],
);

export const interactionMessages = pgTable(
  "interaction_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interactionId: uuid("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    senderType: messageSenderTypeEnum("sender_type").notNull(),
    senderEmail: text("sender_email"),
    text: text("text").notNull(),
    attachments:
      jsonb("attachments").$type<
        Array<{ id: string; filename: string; contentType: string; url: string }>
      >(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_interaction_messages_interaction_created").on(table.interactionId, table.createdAt),
  ],
);

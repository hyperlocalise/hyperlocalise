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
  unique,
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
export const externalTmsProviderKindEnum = pgEnum("external_tms_provider_kind", [
  "crowdin",
  "smartling",
  "phrase",
  "lokalise",
]);
export const externalTmsResourceTypeEnum = pgEnum("external_tms_resource_type", ["file", "key"]);
export const externalTmsTerminologyResourceTypeEnum = pgEnum(
  "external_tms_terminology_resource_type",
  ["glossary", "term_base"],
);
export const projectSourceEnum = pgEnum("project_source", ["native", "external_tms"]);
export const glossarySyncStateEnum = pgEnum("glossary_sync_state", [
  "synced",
  "stale",
  "syncing",
  "error",
]);
export const glossaryTermProvenanceEnum = pgEnum("glossary_term_provenance", ["manual", "sync"]);
export const externalTmsMemoryCapabilityModeEnum = pgEnum("external_tms_memory_capability_mode", [
  "live_search",
  "synced_import",
  "reference_only",
]);
export const providerSyncRunKindEnum = pgEnum("provider_sync_run_kind", [
  "project_scan",
  "file_key_scan",
  "job_task_scan",
  "context_scan",
  "tm_scan",
  "glossary_scan",
  "pull_content",
  "push_translations",
  "webhook",
  "health_check",
]);
export const providerSyncRunStatusEnum = pgEnum("provider_sync_run_status", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const agentRunKindEnum = pgEnum("agent_run_kind", [
  "translate",
  "review",
  "qa_fix",
  "glossary_suggestion",
  "comment_only",
]);
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const tmsAgentAutomationScopeEnum = pgEnum("tms_agent_automation_scope", [
  "organization",
  "project",
  "provider",
]);
export const interactionSourceEnum = pgEnum("interaction_source", [
  "chat_ui",
  "email_agent",
  "github_agent",
  "slack_agent",
]);
export const inboxStatusEnum = pgEnum("inbox_status", ["active", "archived"]);
export const messageSenderTypeEnum = pgEnum("message_sender_type", ["user", "agent"]);
export const organizationLifecycleStatusEnum = pgEnum("organization_lifecycle_status", [
  "active",
  "archived",
  "deprecated",
]);
export const storedFileRoleEnum = pgEnum("stored_file_role", [
  "source",
  "output",
  "reference",
  "asset",
]);
export const storedFileSourceKindEnum = pgEnum("stored_file_source_kind", [
  "chat_upload",
  "email_attachment",
  "job_output",
  "repository_file",
  "tms_file",
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
    // Team that owns this project for membership-scoped access.
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "restrict" }),
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
    // Where this project originated from.
    source: projectSourceEnum("source").notNull().default("native"),
    // Provider kind when sourced from external TMS.
    externalProviderKind: externalTmsProviderKindEnum("external_provider_kind"),
    // External provider credential backing this project.
    externalProviderCredentialId: uuid("external_provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    // Stable project ID from the external TMS provider.
    externalProjectId: text("external_project_id"),
    // Source locale from provider metadata.
    sourceLocale: text("source_locale"),
    // Target locales from provider metadata.
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Optional direct project URL in provider UI.
    externalProjectUrl: text("external_project_url"),
    // Whether provider reports this project as active.
    isActive: boolean("is_active").notNull().default(true),
    // Last successful sync timestamp.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // Last sync failure timestamp and message.
    lastSyncErrorAt: timestamp("last_sync_error_at", { withTimezone: true }),
    lastSyncErrorMessage: text("last_sync_error_message"),
    // Raw provider metadata for debugging and forward compatibility.
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    uniqueIndex("projects_org_provider_external_project_key").on(
      table.organizationId,
      table.externalProviderKind,
      table.externalProjectId,
    ),
    index("idx_projects_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_projects_team_id").on(table.teamId),
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
    // Where this glossary originated from.
    source: projectSourceEnum("source").notNull().default("native"),
    // Provider kind when sourced from external TMS.
    externalProviderKind: externalTmsProviderKindEnum("external_provider_kind"),
    // External provider credential backing this glossary.
    externalProviderCredentialId: uuid("external_provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    // Provider project that scopes this glossary or term base.
    externalProjectId: text("external_project_id"),
    // Whether the synced resource is a glossary or term base.
    externalResourceType: externalTmsTerminologyResourceTypeEnum("external_resource_type"),
    // Stable glossary or term-base ID from the external TMS provider.
    externalGlossaryId: text("external_glossary_id"),
    // Locales covered by the synced terminology resource.
    localeCoverage: jsonb("locale_coverage")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Term count reported by the provider when available.
    termCount: integer("term_count"),
    // Sync lifecycle for provider-backed glossaries.
    syncState: glossarySyncStateEnum("sync_state"),
    // Provider-reported term capabilities such as import/export support.
    termCapabilities: jsonb("term_capabilities")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Optional direct glossary URL in provider UI.
    externalUrl: text("external_url"),
    // Last successful sync timestamp.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // Last sync failure timestamp and message.
    lastSyncErrorAt: timestamp("last_sync_error_at", { withTimezone: true }),
    lastSyncErrorMessage: text("last_sync_error_message"),
    // Raw provider metadata for debugging and forward compatibility.
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    uniqueIndex("glossaries_org_provider_external_resource_key").on(
      table.organizationId,
      table.externalProviderKind,
      table.externalProjectId,
      table.externalResourceType,
      table.externalGlossaryId,
      table.sourceLocale,
      table.targetLocale,
    ),
    index("idx_glossaries_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_glossaries_org_locale_pair").on(
      table.organizationId,
      table.sourceLocale,
      table.targetLocale,
    ),
    index("idx_glossaries_created_by_user_id").on(table.createdByUserId),
    index("idx_glossaries_sync_state").on(table.syncState),
    index("idx_glossaries_external_provider").on(
      table.organizationId,
      table.externalProviderKind,
      table.externalProjectId,
    ),
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
    // Optional external identifier retained for later sync or dedupe.
    externalKey: text("external_key"),
    // Optional source label such as manual or sync.
    provenance: glossaryTermProvenanceEnum("provenance").notNull().default("manual"),
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
    uniqueIndex("glossary_terms_glossary_external_key").on(table.glossaryId, table.externalKey),
    index("idx_glossary_terms_glossary_created_at").on(table.glossaryId, table.createdAt),
    index("idx_glossary_terms_external_key").on(table.externalKey),
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
    // Where this translation memory originated from.
    source: projectSourceEnum("source").notNull().default("native"),
    // Provider kind when sourced from external TMS.
    externalProviderKind: externalTmsProviderKindEnum("external_provider_kind"),
    // External provider credential backing this TM resource.
    externalProviderCredentialId: uuid("external_provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    // Provider project that scopes this TM resource.
    externalProjectId: text("external_project_id"),
    // Stable translation memory ID from the external TMS provider.
    externalMemoryId: text("external_memory_id"),
    // Locales covered by the synced TM resource.
    localeCoverage: jsonb("locale_coverage")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Segment count reported by the provider when available.
    segmentCount: integer("segment_count"),
    // Sync lifecycle for provider-backed translation memories.
    syncState: glossarySyncStateEnum("sync_state"),
    // How segments can be accessed: live search, synced import, or reference-only.
    capabilityMode: externalTmsMemoryCapabilityModeEnum("capability_mode"),
    // Provider-reported segment capabilities such as search/import support.
    segmentCapabilities: jsonb("segment_capabilities")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Optional direct TM URL in provider UI.
    externalUrl: text("external_url"),
    // Last successful sync timestamp.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // Last sync failure timestamp and message.
    lastSyncErrorAt: timestamp("last_sync_error_at", { withTimezone: true }),
    lastSyncErrorMessage: text("last_sync_error_message"),
    // Raw provider metadata for debugging and forward compatibility.
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    uniqueIndex("memories_org_provider_external_memory_key").on(
      table.organizationId,
      table.externalProviderKind,
      table.externalProjectId,
      table.externalMemoryId,
    ),
    index("idx_memories_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_memories_created_by_user_id").on(table.createdByUserId),
    index("idx_memories_sync_state").on(table.syncState),
    index("idx_memories_external_provider").on(
      table.organizationId,
      table.externalProviderKind,
      table.externalProjectId,
    ),
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
    uniqueIndex("memory_entries_memory_external_key").on(table.memoryId, table.externalKey),
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

export const organizationExternalTmsProviderCredentials = pgTable(
  "organization_external_tms_provider_credentials",
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
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    displayName: text("display_name").notNull(),
    region: text("region"),
    baseUrl: text("base_url"),
    validationStatus: text("validation_status").notNull().default("unvalidated"),
    validationMessage: text("validation_message"),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    encryptionAlgorithm: text("encryption_algorithm").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    maskedSecretSuffix: text("masked_secret_suffix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_external_tms_provider_credentials_org_provider_kind_key").on(
      table.organizationId,
      table.providerKind,
    ),
    index("idx_organization_external_tms_provider_credentials_updated_at").on(table.updatedAt),
  ],
);

export const tmsAgentAutomationSettings = pgTable(
  "tms_agent_automation_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: tmsAgentAutomationScopeEnum("scope").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "cascade" },
    ),
    settings: jsonb("settings")
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
    unique("tms_agent_automation_settings_org_scope_key")
      .on(table.organizationId, table.scope, table.projectId, table.providerCredentialId)
      .nullsNotDistinct(),
    index("idx_tms_agent_automation_settings_org").on(table.organizationId),
    check(
      "tms_agent_automation_settings_scope_shape",
      sql`(
        (${table.scope} = 'organization' AND ${table.projectId} IS NULL AND ${table.providerCredentialId} IS NULL)
        OR (${table.scope} = 'project' AND ${table.projectId} IS NOT NULL AND ${table.providerCredentialId} IS NULL)
        OR (${table.scope} = 'provider' AND ${table.projectId} IS NULL AND ${table.providerCredentialId} IS NOT NULL)
      )`,
    ),
  ],
);

export const providerSyncRuns = pgTable(
  "provider_sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    kind: providerSyncRunKindEnum("kind").notNull(),
    status: providerSyncRunStatusEnum("status").notNull().default("running"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    externalProjectId: text("external_project_id"),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    externalResourceId: text("external_resource_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    counts: jsonb("counts")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    providerMetadata: jsonb("provider_metadata")
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
    index("idx_provider_sync_runs_org_started").on(table.organizationId, table.startedAt),
    index("idx_provider_sync_runs_org_provider_started").on(
      table.organizationId,
      table.providerKind,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_org_kind_started").on(
      table.organizationId,
      table.kind,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_org_project_started").on(
      table.organizationId,
      table.projectId,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_org_resource_started").on(
      table.organizationId,
      table.resourceType,
      table.resourceId,
      table.startedAt,
    ),
    index("idx_provider_sync_runs_status").on(table.status),
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
    index("idx_connectors_slack_team_id")
      .on(sql`(config->>'teamId')`)
      .where(sql`${table.kind} = 'slack'`),
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

export const organizationApiKeys = pgTable(
  "organization_api_keys",
  {
    // Stable API key identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Organization that owns this key.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Human-readable name for the key.
    name: text("name").notNull(),
    // SHA-256 hash of the API key secret used for lookup.
    keyHash: text("key_hash").notNull(),
    // First 8 characters of the key shown in UI lists.
    keyPrefix: text("key_prefix").notNull(),
    // Permissions granted to this key, e.g. ["jobs:read", "jobs:write", "files:read", "files:write"].
    permissions: jsonb("permissions")
      .$type<string[]>()
      .notNull()
      .default(sql`'["jobs:read", "jobs:write", "files:read", "files:write"]'::jsonb`),
    // User who created the key.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // When the key was last used successfully.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    // When the key was revoked. Null means active.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // When the key record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the key record last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("organization_api_keys_key_hash_key").on(table.keyHash),
    index("idx_organization_api_keys_org").on(table.organizationId),
    index("idx_organization_api_keys_created_at").on(table.createdAt),
  ],
);

export const mcpSessions = pgTable(
  "mcp_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("mcp"),
    accessTokenHash: text("access_token_hash").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    workosAccessTokenEncrypted: text("workos_access_token_encrypted"),
    workosRefreshTokenEncrypted: text("workos_refresh_token_encrypted"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("mcp_sessions_access_token_hash_key").on(table.accessTokenHash),
    uniqueIndex("mcp_sessions_refresh_token_hash_key").on(table.refreshTokenHash),
    index("idx_mcp_sessions_user_id").on(table.userId),
    index("idx_mcp_sessions_organization_id").on(table.organizationId),
    index("idx_mcp_sessions_expires_at").on(table.expiresAt),
  ],
);

export const mcpOAuthClients = pgTable(
  "mcp_oauth_clients",
  {
    clientId: text("client_id").primaryKey(),
    clientName: text("client_name"),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    grantTypes: jsonb("grant_types")
      .$type<string[]>()
      .notNull()
      .default(["authorization_code", "refresh_token"]),
    responseTypes: jsonb("response_types").$type<string[]>().notNull().default(["code"]),
    scope: text("scope").notNull().default("mcp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_mcp_oauth_clients_created_at").on(table.createdAt)],
);

export const usedAuthorizationCodes = pgTable(
  "used_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_used_authorization_codes_expires_at").on(table.expiresAt)],
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
    // Link back to the API key that created this job, for audit.
    apiKeyId: uuid("api_key_id").references(() => organizationApiKeys.id, {
      onDelete: "set null",
    }),
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
    index("idx_jobs_api_key_id").on(table.apiKeyId),
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
    sourceFileVersionId: uuid("source_file_version_id").references(
      () => repositorySourceFileVersions.id,
      { onDelete: "set null" },
    ),
    // Describes the shape of a successful translation result or terminal error payload.
    outcomeKind: translationJobOutcomeKindEnum("outcome_kind"),
  },
  (table) => [
    index("idx_translation_job_details_type").on(table.type),
    index("idx_translation_job_details_source_file_version").on(table.sourceFileVersionId),
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

export const externalJobDetails = pgTable(
  "external_job_details",
  {
    // One-to-one extension row for jobs that originated from an external TMS provider.
    jobId: text("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    // Tenant that owns this external job, denormalized for unique index scoping.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Provider that owns this external job.
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    // Provider-scoped job identifier used for idempotent upserts.
    externalJobId: text("external_job_id").notNull(),
    // Optional provider task identifier when the provider uses a job/task hierarchy.
    externalTaskId: text("external_task_id"),
    // Raw provider status string preserved for diagnostics.
    externalStatus: text("external_status").notNull(),
    // Human-readable title from the provider.
    title: text("title").notNull().default(""),
    // Provider due date, if available.
    dueDate: timestamp("due_date", { withTimezone: true }),
    // Target locales from the provider job payload.
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Assigned user identifiers (emails or external IDs) from the provider.
    assignedUsers: jsonb("assigned_users")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Direct URL to the job in the provider UI.
    externalUrl: text("external_url"),
    // Sync state tracked independently of provider status for UI badges.
    syncState: text("sync_state").notNull().default("pending"),
    // Raw provider payload retained for debugging and forward compatibility.
    providerPayload: jsonb("provider_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Optional link to a native Hyperlocalise job created when agent work is started.
    linkedJobId: text("linked_job_id").references(() => jobs.id, { onDelete: "set null" }),
    // When the external job record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the external job record was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_external_job_details_provider_kind").on(table.providerKind),
    index("idx_external_job_details_external_job_id").on(table.externalJobId),
    index("idx_external_job_details_external_task_id").on(table.externalTaskId),
    index("idx_external_job_details_sync_state").on(table.syncState),
    index("idx_external_job_details_linked_job").on(table.linkedJobId),
    uniqueIndex("idx_external_job_details_provider_job_unique").on(
      table.organizationId,
      table.externalJobId,
      table.providerKind,
    ),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    externalJobId: text("external_job_id").notNull(),
    externalTaskId: text("external_task_id"),
    kind: agentRunKindEnum("kind").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputSummary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    changedItems: jsonb("changed_items")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    hyperlocaliseJobId: text("hyperlocalise_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_agent_runs_org_created").on(table.organizationId, table.createdAt),
    index("idx_agent_runs_org_provider_job").on(
      table.organizationId,
      table.providerKind,
      table.externalJobId,
    ),
    index("idx_agent_runs_org_provider_task").on(
      table.organizationId,
      table.providerKind,
      table.externalTaskId,
    ),
    index("idx_agent_runs_org_status").on(table.organizationId, table.status),
    index("idx_agent_runs_hyperlocalise_job").on(table.hyperlocaliseJobId),
    index("idx_agent_runs_org_actor").on(table.organizationId, table.actorUserId),
  ],
);

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

export const storedFiles = pgTable(
  "stored_files",
  {
    // Stable file identifier used by jobs and interaction attachments.
    id: text("id").primaryKey(),
    // Tenant that owns this file.
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Optional project scope. Null means the file is workspace-level.
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    // User who uploaded or generated the file, if known.
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // How this file is used in the product.
    role: storedFileRoleEnum("role").notNull(),
    // Where the file came from.
    sourceKind: storedFileSourceKindEnum("source_kind").notNull(),
    // Interaction that introduced the file, if any.
    sourceInteractionId: uuid("source_interaction_id").references(() => interactions.id, {
      onDelete: "set null",
    }),
    // Job that produced the file, if any.
    sourceJobId: text("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    // Object storage implementation that owns the bytes.
    storageProvider: text("storage_provider").notNull(),
    // Provider-specific object key or pathname.
    storageKey: text("storage_key").notNull(),
    // Provider URL retained for server-side retrieval and diagnostics.
    storageUrl: text("storage_url").notNull(),
    // Download URL when the provider returns one.
    downloadUrl: text("download_url"),
    // Original or generated filename shown to users.
    filename: text("filename").notNull(),
    // MIME type captured at storage time.
    contentType: text("content_type").notNull(),
    // File size in bytes.
    byteSize: integer("byte_size").notNull(),
    // SHA-256 of the stored bytes for dedupe and audit checks.
    sha256: text("sha256").notNull(),
    // Provider entity tag, when available.
    etag: text("etag"),
    // Extensible provenance or adapter metadata.
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // When the file metadata record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When the file metadata last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("stored_files_storage_provider_key").on(table.storageProvider, table.storageKey),
    index("idx_stored_files_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_stored_files_project_created_at").on(table.projectId, table.createdAt),
    index("idx_stored_files_created_by_user_id").on(table.createdByUserId),
    index("idx_stored_files_source_interaction").on(table.sourceInteractionId),
    index("idx_stored_files_source_job").on(table.sourceJobId),
    index("idx_stored_files_org_role").on(table.organizationId, table.role),
  ],
);

export const repositorySourceFiles = pgTable(
  "repository_source_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("repository_source_files_project_path_key").on(table.projectId, table.sourcePath),
    index("idx_repository_source_files_org_project").on(table.organizationId, table.projectId),
  ],
);

export const repositorySourceFileVersions = pgTable(
  "repository_source_file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositorySourceFileId: uuid("repository_source_file_id")
      .notNull()
      .references(() => repositorySourceFiles.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    storedFileId: text("stored_file_id")
      .notNull()
      .references(() => storedFiles.id, { onDelete: "cascade" }),
    sourceHash: text("source_hash"),
    commitSha: text("commit_sha"),
    workflowRunId: text("workflow_run_id"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedByApiKeyId: uuid("uploaded_by_api_key_id").references(() => organizationApiKeys.id, {
      onDelete: "set null",
    }),
    uploadSurface: text("upload_surface"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("repository_source_file_versions_stored_file_key").on(table.storedFileId),
    index("idx_repository_source_file_versions_file_created").on(
      table.repositorySourceFileId,
      table.createdAt,
    ),
    index("idx_repository_source_file_versions_project_path_created").on(
      table.projectId,
      table.sourcePath,
      table.createdAt,
    ),
    index("idx_repository_source_file_versions_workflow_run").on(table.workflowRunId),
    index("idx_repository_source_file_versions_api_key").on(table.uploadedByApiKeyId),
  ],
);

export const externalTmsFiles = pgTable(
  "external_tms_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    providerCredentialId: uuid("provider_credential_id").references(
      () => organizationExternalTmsProviderCredentials.id,
      { onDelete: "set null" },
    ),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    externalProjectId: text("external_project_id").notNull(),
    resourceType: externalTmsResourceTypeEnum("resource_type").notNull(),
    externalResourceId: text("external_resource_id").notNull(),
    sourcePath: text("source_path").notNull(),
    displayName: text("display_name").notNull(),
    format: text("format"),
    sourceLocale: text("source_locale"),
    targetLocales: jsonb("target_locales")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sourceHash: text("source_hash"),
    revision: text("revision"),
    storedFileId: text("stored_file_id").references(() => storedFiles.id, {
      onDelete: "set null",
    }),
    externalUrl: text("external_url"),
    syncState: text("sync_state").notNull().default("pending"),
    localeReadiness: jsonb("locale_readiness")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    providerPayload: jsonb("provider_payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("external_tms_files_provider_resource_key").on(
      table.organizationId,
      table.providerKind,
      table.externalProjectId,
      table.resourceType,
      table.externalResourceId,
    ),
    index("idx_external_tms_files_org_project_path").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
    ),
    index("idx_external_tms_files_provider_project").on(
      table.organizationId,
      table.providerKind,
      table.externalProjectId,
    ),
    index("idx_external_tms_files_stored_file").on(table.storedFileId),
    index("idx_external_tms_files_sync_state").on(table.syncState),
  ],
);

export const externalTmsFileVersions = pgTable(
  "external_tms_file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    externalTmsFileId: uuid("external_tms_file_id")
      .notNull()
      .references(() => externalTmsFiles.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    revision: text("revision"),
    sourceHash: text("source_hash"),
    storedFileId: text("stored_file_id").references(() => storedFiles.id, {
      onDelete: "set null",
    }),
    format: text("format"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_external_tms_file_versions_file_captured").on(
      table.externalTmsFileId,
      table.capturedAt,
    ),
    index("idx_external_tms_file_versions_org_project_path").on(
      table.organizationId,
      table.projectId,
      table.sourcePath,
    ),
  ],
);

export const repoTmsMutationLogActionEnum = pgEnum("repo_tms_mutation_log_action", [
  "upload_sources",
  "apply_fixes",
  "commit_changes",
  "push_to_branch",
  "tms_mutate",
]);

export const repoTmsMutationLogStatusEnum = pgEnum("repo_tms_mutation_log_status", [
  "pending",
  "approved",
  "denied",
  "completed",
  "failed",
]);

export const repoTmsMutationLogs = pgTable(
  "repo_tms_mutation_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    workflowRunId: text("workflow_run_id"),
    taskId: text("task_id").notNull(),
    actor: jsonb("actor")
      .$type<{
        sourceUserId: string;
        userId?: string;
        email?: string;
        displayName?: string;
        role?: string;
      }>()
      .notNull(),
    action: repoTmsMutationLogActionEnum("action").notNull(),
    source: text("source").notNull(),
    provider: text("provider"),
    status: repoTmsMutationLogStatusEnum("status").notNull().default("pending"),
    details: jsonb("details")
      .$type<{
        changedPaths?: string[];
        commands?: string[];
        error?: string;
        reason?: string;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_repo_tms_mutation_logs_org").on(table.organizationId),
    index("idx_repo_tms_mutation_logs_task").on(table.taskId),
    index("idx_repo_tms_mutation_logs_workflow_run").on(table.workflowRunId),
    index("idx_repo_tms_mutation_logs_created_at").on(table.createdAt),
  ],
);

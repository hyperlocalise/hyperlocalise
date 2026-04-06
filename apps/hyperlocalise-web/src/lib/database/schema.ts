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
export const translationAssetStatusEnum = pgEnum("translation_asset_status", [
  "draft",
  "active",
  "archived",
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

export const translationGlossaries = pgTable(
  "translation_glossaries",
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
    status: translationAssetStatusEnum("status").notNull().default("active"),
    // When the glossary was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When glossary metadata last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_translation_glossaries_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_translation_glossaries_org_locale_pair").on(
      table.organizationId,
      table.sourceLocale,
      table.targetLocale,
    ),
    index("idx_translation_glossaries_created_by_user_id").on(table.createdByUserId),
  ],
);

export const translationGlossaryTerms = pgTable(
  "translation_glossary_terms",
  {
    // Stable glossary term identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Parent glossary library that owns the term.
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => translationGlossaries.id, { onDelete: "cascade" }),
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
    uniqueIndex("translation_glossary_terms_glossary_source_term_key").on(
      table.glossaryId,
      table.sourceTerm,
    ),
    uniqueIndex("translation_glossary_terms_glossary_source_term_ci_key")
      .on(table.glossaryId, sql`lower(${table.sourceTerm})`)
      .where(sql`${table.caseSensitive} = false`),
    index("idx_translation_glossary_terms_glossary_created_at").on(
      table.glossaryId,
      table.createdAt,
    ),
    index("idx_translation_glossary_terms_search_vector").using("gin", table.searchVector),
  ],
);

export const translationMemories = pgTable(
  "translation_memories",
  {
    // Stable translation memory container identifier.
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
    status: translationAssetStatusEnum("status").notNull().default("active"),
    // When the TM was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When TM metadata last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_translation_memories_org_created_at").on(table.organizationId, table.createdAt),
    index("idx_translation_memories_created_by_user_id").on(table.createdByUserId),
  ],
);

export const translationMemoryEntries = pgTable(
  "translation_memory_entries",
  {
    // Stable TM entry identifier.
    id: uuid("id").defaultRandom().primaryKey(),
    // Parent TM container that owns the entry.
    translationMemoryId: uuid("translation_memory_id")
      .notNull()
      .references(() => translationMemories.id, { onDelete: "cascade" }),
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
      "translation_memory_entries_match_score_check",
      sql`${table.matchScore} >= 0 AND ${table.matchScore} <= 100`,
    ),
    uniqueIndex("translation_memory_entries_memory_locale_source_key").on(
      table.translationMemoryId,
      table.sourceLocale,
      table.targetLocale,
      table.normalizedSourceText,
    ),
    index("idx_translation_memory_entries_memory_locale_pair").on(
      table.translationMemoryId,
      table.sourceLocale,
      table.targetLocale,
    ),
    index("idx_translation_memory_entries_external_key").on(table.externalKey),
    index("idx_translation_memory_entries_search_vector").using("gin", table.searchVector),
  ],
);

export const translationProjectGlossaries = pgTable(
  "translation_project_glossaries",
  {
    // Stable identifier for a project-to-glossary attachment.
    id: uuid("id").defaultRandom().primaryKey(),
    // Project receiving the reusable glossary library.
    projectId: text("project_id")
      .notNull()
      .references(() => translationProjects.id, { onDelete: "cascade" }),
    // Attached glossary library.
    glossaryId: uuid("glossary_id")
      .notNull()
      .references(() => translationGlossaries.id, { onDelete: "cascade" }),
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
    uniqueIndex("translation_project_glossaries_project_glossary_key").on(
      table.projectId,
      table.glossaryId,
    ),
    index("idx_translation_project_glossaries_project_priority").on(
      table.projectId,
      table.priority,
    ),
  ],
);

export const translationProjectMemories = pgTable(
  "translation_project_memories",
  {
    // Stable identifier for a project-to-TM attachment.
    id: uuid("id").defaultRandom().primaryKey(),
    // Project receiving the reusable TM library.
    projectId: text("project_id")
      .notNull()
      .references(() => translationProjects.id, { onDelete: "cascade" }),
    // Attached translation memory library.
    translationMemoryId: uuid("translation_memory_id")
      .notNull()
      .references(() => translationMemories.id, { onDelete: "cascade" }),
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
    uniqueIndex("translation_project_memories_project_memory_key").on(
      table.projectId,
      table.translationMemoryId,
    ),
    index("idx_translation_project_memories_project_priority").on(table.projectId, table.priority),
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
    status: translationJobStatusEnum("status").notNull().default("queued"),
    // Canonical job input stored as domain data, not workflow engine state.
    inputPayload: jsonb("input_payload").$type<unknown>().notNull(),
    // Describes the shape of a successful result or terminal error payload.
    outcomeKind: translationJobOutcomeKindEnum("outcome_kind"),
    // Terminal job output persisted for retrieval after execution completes.
    outcomePayload: jsonb("outcome_payload").$type<unknown>(),
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
    index("idx_translation_jobs_status").on(table.status),
  ],
);

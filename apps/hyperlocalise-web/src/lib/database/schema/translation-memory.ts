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

import { tsvector } from "./core";
import {
  assetStatusEnum,
  externalTmsMemoryCapabilityModeEnum,
  externalTmsProviderKindEnum,
  externalTmsTerminologyResourceTypeEnum,
  glossarySyncStateEnum,
  glossaryTermProvenanceEnum,
  projectSourceEnum,
} from "./enums";
import { organizations, users } from "./organizations";
import { organizationExternalTmsProviderCredentials } from "./providers";
import { projects } from "./projects";

/**
 * Stores reusable terminology libraries for an organization. A glossary can be native or provider-backed and captures locale coverage, provider sync metadata, and lifecycle state.
 */
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

/**
 * Stores individual terminology entries inside a glossary, including matching behavior, target terms, provenance, review status, metadata, and a lexical search vector.
 */
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

/**
 * Stores reusable translation-memory libraries for an organization. Memories can be native or provider-backed and describe sync health, capabilities, locale coverage, and provider metadata.
 */
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

/**
 * Stores aligned source and target text examples inside a translation memory. Entries include normalized source text for dedupe and a full-text search vector for retrieval.
 */
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

/**
 * Attaches glossary libraries to projects with priority ordering so runtime context assembly can load the right terminology for a project.
 */
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

/**
 * Attaches translation-memory libraries to projects with priority ordering so runtime retrieval can search the right memory sources first.
 */
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

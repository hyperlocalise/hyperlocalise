CREATE TYPE "public"."conversation_source" AS ENUM('chat_ui', 'email_agent', 'github_agent');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('translation', 'research', 'brief');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('openai', 'anthropic', 'gemini', 'groq', 'mistral');--> statement-breakpoint
CREATE TYPE "public"."message_sender_type" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TYPE "public"."organization_membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."team_membership_role" AS ENUM('manager', 'member');--> statement-breakpoint
CREATE TYPE "public"."translation_asset_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."translation_job_outcome_kind" AS ENUM('string_result', 'file_result', 'error');--> statement-breakpoint
CREATE TYPE "public"."translation_job_type" AS ENUM('string', 'file');--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" "message_sender_type" NOT NULL,
	"sender_email" text,
	"text" text NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"source" "conversation_source" NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"source_thread_id" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installation_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"default_branch" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_app_id" bigint NOT NULL,
	"account_login" text,
	"account_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"created_by_user_id" uuid,
	"kind" "job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"input_payload" jsonb NOT NULL,
	"outcome_payload" jsonb,
	"last_error" text,
	"workflow_run_id" text,
	"conversation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_llm_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"provider" "llm_provider" NOT NULL,
	"default_model" text NOT NULL,
	"masked_api_key_suffix" text NOT NULL,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"last_validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workos_membership_id" text,
	"role" "organization_membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"email_agent_enabled" boolean DEFAULT false NOT NULL,
	"inbound_email_alias" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_membership_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_glossaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_locale" text NOT NULL,
	"target_locale" text NOT NULL,
	"status" "translation_asset_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"glossary_id" uuid NOT NULL,
	"source_term" text NOT NULL,
	"target_term" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"part_of_speech" text DEFAULT '' NOT NULL,
	"case_sensitive" boolean DEFAULT false NOT NULL,
	"forbidden" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(source_term, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(target_term, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(description, '')), 'C')
    ) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_job_details" (
	"job_id" text PRIMARY KEY NOT NULL,
	"type" "translation_job_type" NOT NULL,
	"outcome_kind" "translation_job_outcome_kind"
);
--> statement-breakpoint
CREATE TABLE "translation_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "translation_asset_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_memory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_memory_id" uuid NOT NULL,
	"source_locale" text NOT NULL,
	"target_locale" text NOT NULL,
	"source_text" text NOT NULL,
	"normalized_source_text" text NOT NULL,
	"target_text" text NOT NULL,
	"match_score" integer DEFAULT 100 NOT NULL,
	"provenance" text DEFAULT 'manual' NOT NULL,
	"external_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(source_text, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(target_text, '')), 'B')
    ) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_memory_entries_match_score_check" CHECK ("translation_memory_entries"."match_score" >= 0 AND "translation_memory_entries"."match_score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "translation_project_glossaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"glossary_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_project_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"translation_memory_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"translation_context" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installation_repositories" ADD CONSTRAINT "github_installation_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installation_repositories" ADD CONSTRAINT "github_installation_repositories_github_installation_id_github_installations_github_installation_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("github_installation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_conversation_org_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_llm_provider_credentials" ADD CONSTRAINT "organization_llm_provider_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_llm_provider_credentials" ADD CONSTRAINT "organization_llm_provider_credentials_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_llm_provider_credentials" ADD CONSTRAINT "organization_llm_provider_credentials_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossaries" ADD CONSTRAINT "translation_glossaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossaries" ADD CONSTRAINT "translation_glossaries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossary_terms" ADD CONSTRAINT "translation_glossary_terms_glossary_id_translation_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."translation_glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_job_details" ADD CONSTRAINT "translation_job_details_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_memories" ADD CONSTRAINT "translation_memories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_memories" ADD CONSTRAINT "translation_memories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_memory_entries" ADD CONSTRAINT "translation_memory_entries_translation_memory_id_translation_memories_id_fk" FOREIGN KEY ("translation_memory_id") REFERENCES "public"."translation_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_glossary_org_fk" FOREIGN KEY ("glossary_id","organization_id") REFERENCES "public"."translation_glossaries"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_memory_org_fk" FOREIGN KEY ("translation_memory_id","organization_id") REFERENCES "public"."translation_memories"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_projects" ADD CONSTRAINT "translation_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_projects" ADD CONSTRAINT "translation_projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversation_messages_conversation_created" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_organization_id_key" ON "conversations" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_source_thread_id_key" ON "conversations" USING btree ("organization_id","source","source_thread_id") WHERE "conversations"."source_thread_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_conversations_org_last_message" ON "conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installation_repositories_github_repository_id_key" ON "github_installation_repositories" USING btree ("github_installation_id","github_repository_id");--> statement-breakpoint
CREATE INDEX "idx_github_installation_repositories_org" ON "github_installation_repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_github_installation_repositories_installation" ON "github_installation_repositories" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "idx_github_installation_repositories_org_enabled" ON "github_installation_repositories" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_organization_id_key" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_github_installation_id_key" ON "github_installations" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "idx_github_installations_created_at" ON "github_installations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_org_created_at" ON "jobs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_project_created_at" ON "jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_jobs_created_by_user_id" ON "jobs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_kind_status" ON "jobs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "idx_jobs_workflow_run_id" ON "jobs" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_jobs_conversation" ON "jobs" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_llm_provider_credentials_org_key" ON "organization_llm_provider_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_organization_llm_provider_credentials_updated_at" ON "organization_llm_provider_credentials" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_key" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_workos_membership_id_key" ON "organization_memberships" USING btree ("workos_membership_id");--> statement-breakpoint
CREATE INDEX "idx_organization_memberships_user_id" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_workos_organization_id_key" ON "organizations" USING btree ("workos_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_inbound_email_alias_key" ON "organizations" USING btree ("inbound_email_alias");--> statement-breakpoint
CREATE INDEX "idx_organizations_created_at" ON "organizations" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_team_user_key" ON "team_memberships" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_user_id" ON "team_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_org_slug_key" ON "teams" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "idx_teams_org_created_at" ON "teams" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_glossaries_id_organization_id_key" ON "translation_glossaries" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_translation_glossaries_org_created_at" ON "translation_glossaries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_glossaries_org_locale_pair" ON "translation_glossaries" USING btree ("organization_id","source_locale","target_locale");--> statement-breakpoint
CREATE INDEX "idx_translation_glossaries_created_by_user_id" ON "translation_glossaries" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_glossary_terms_glossary_source_term_key" ON "translation_glossary_terms" USING btree ("glossary_id","source_term");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_glossary_terms_glossary_source_term_ci_key" ON "translation_glossary_terms" USING btree ("glossary_id",lower("source_term")) WHERE "translation_glossary_terms"."case_sensitive" = false;--> statement-breakpoint
CREATE INDEX "idx_translation_glossary_terms_glossary_created_at" ON "translation_glossary_terms" USING btree ("glossary_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_glossary_terms_search_vector" ON "translation_glossary_terms" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_translation_job_details_type" ON "translation_job_details" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_translation_job_details_outcome_kind" ON "translation_job_details" USING btree ("outcome_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_memories_id_organization_id_key" ON "translation_memories" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_translation_memories_org_created_at" ON "translation_memories" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_memories_created_by_user_id" ON "translation_memories" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_memory_entries_memory_locale_source_key" ON "translation_memory_entries" USING btree ("translation_memory_id","source_locale","target_locale","normalized_source_text");--> statement-breakpoint
CREATE INDEX "idx_translation_memory_entries_memory_locale_pair" ON "translation_memory_entries" USING btree ("translation_memory_id","source_locale","target_locale");--> statement-breakpoint
CREATE INDEX "idx_translation_memory_entries_external_key" ON "translation_memory_entries" USING btree ("external_key");--> statement-breakpoint
CREATE INDEX "idx_translation_memory_entries_search_vector" ON "translation_memory_entries" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_project_glossaries_project_glossary_key" ON "translation_project_glossaries" USING btree ("project_id","glossary_id");--> statement-breakpoint
CREATE INDEX "idx_translation_project_glossaries_org" ON "translation_project_glossaries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_translation_project_glossaries_project_priority" ON "translation_project_glossaries" USING btree ("project_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_project_memories_project_memory_key" ON "translation_project_memories" USING btree ("project_id","translation_memory_id");--> statement-breakpoint
CREATE INDEX "idx_translation_project_memories_org" ON "translation_project_memories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_translation_project_memories_project_priority" ON "translation_project_memories" USING btree ("project_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_projects_id_organization_id_key" ON "translation_projects" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_translation_projects_org_created_at" ON "translation_projects" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_projects_created_by_user_id" ON "translation_projects" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_workos_user_id_key" ON "users" USING btree ("workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "idx_users_created_at" ON "users" USING btree ("created_at");
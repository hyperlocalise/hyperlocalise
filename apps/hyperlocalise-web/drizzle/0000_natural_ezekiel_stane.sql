CREATE TYPE "public"."organization_membership_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."translation_asset_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."translation_job_outcome_kind" AS ENUM('string_result', 'file_result', 'error');--> statement-breakpoint
CREATE TYPE "public"."translation_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."translation_job_type" AS ENUM('string', 'file');--> statement-breakpoint
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
CREATE TABLE "translation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"created_by_user_id" uuid,
	"type" "translation_job_type" NOT NULL,
	"status" "translation_job_status" DEFAULT 'queued' NOT NULL,
	"input_payload" jsonb NOT NULL,
	"outcome_kind" "translation_job_outcome_kind",
	"outcome_payload" jsonb,
	"last_error" text,
	"workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
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
	"project_id" text NOT NULL,
	"glossary_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_project_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossaries" ADD CONSTRAINT "translation_glossaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossaries" ADD CONSTRAINT "translation_glossaries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossary_terms" ADD CONSTRAINT "translation_glossary_terms_glossary_id_translation_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."translation_glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD CONSTRAINT "translation_jobs_project_id_translation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."translation_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD CONSTRAINT "translation_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_memories" ADD CONSTRAINT "translation_memories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_memories" ADD CONSTRAINT "translation_memories_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_memory_entries" ADD CONSTRAINT "translation_memory_entries_translation_memory_id_translation_memories_id_fk" FOREIGN KEY ("translation_memory_id") REFERENCES "public"."translation_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_project_id_translation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."translation_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_glossary_id_translation_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."translation_glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_project_id_translation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."translation_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_translation_memory_id_translation_memories_id_fk" FOREIGN KEY ("translation_memory_id") REFERENCES "public"."translation_memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_projects" ADD CONSTRAINT "translation_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_projects" ADD CONSTRAINT "translation_projects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_key" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_workos_membership_id_key" ON "organization_memberships" USING btree ("workos_membership_id");--> statement-breakpoint
CREATE INDEX "idx_organization_memberships_user_id" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_workos_organization_id_key" ON "organizations" USING btree ("workos_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_organizations_created_at" ON "organizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_glossaries_org_created_at" ON "translation_glossaries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_glossaries_org_locale_pair" ON "translation_glossaries" USING btree ("organization_id","source_locale","target_locale");--> statement-breakpoint
CREATE INDEX "idx_translation_glossaries_created_by_user_id" ON "translation_glossaries" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_glossary_terms_glossary_source_term_key" ON "translation_glossary_terms" USING btree ("glossary_id","source_term");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_glossary_terms_glossary_source_term_ci_key" ON "translation_glossary_terms" USING btree ("glossary_id",lower("source_term")) WHERE "translation_glossary_terms"."case_sensitive" = false;--> statement-breakpoint
CREATE INDEX "idx_translation_glossary_terms_glossary_created_at" ON "translation_glossary_terms" USING btree ("glossary_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_glossary_terms_search_vector" ON "translation_glossary_terms" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_translation_jobs_project_created_at" ON "translation_jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_jobs_created_by_user_id" ON "translation_jobs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_translation_jobs_workflow_run_id" ON "translation_jobs" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_translation_jobs_status" ON "translation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_translation_memories_org_created_at" ON "translation_memories" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_memories_created_by_user_id" ON "translation_memories" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_memory_entries_memory_locale_source_key" ON "translation_memory_entries" USING btree ("translation_memory_id","source_locale","target_locale","normalized_source_text");--> statement-breakpoint
CREATE INDEX "idx_translation_memory_entries_memory_locale_pair" ON "translation_memory_entries" USING btree ("translation_memory_id","source_locale","target_locale");--> statement-breakpoint
CREATE INDEX "idx_translation_memory_entries_external_key" ON "translation_memory_entries" USING btree ("external_key");--> statement-breakpoint
CREATE INDEX "idx_translation_memory_entries_search_vector" ON "translation_memory_entries" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_project_glossaries_project_glossary_key" ON "translation_project_glossaries" USING btree ("project_id","glossary_id");--> statement-breakpoint
CREATE INDEX "idx_translation_project_glossaries_project_priority" ON "translation_project_glossaries" USING btree ("project_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_project_memories_project_memory_key" ON "translation_project_memories" USING btree ("project_id","translation_memory_id");--> statement-breakpoint
CREATE INDEX "idx_translation_project_memories_project_priority" ON "translation_project_memories" USING btree ("project_id","priority");--> statement-breakpoint
CREATE INDEX "idx_translation_projects_org_created_at" ON "translation_projects" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_projects_created_by_user_id" ON "translation_projects" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_workos_user_id_key" ON "users" USING btree ("workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "idx_users_created_at" ON "users" USING btree ("created_at");
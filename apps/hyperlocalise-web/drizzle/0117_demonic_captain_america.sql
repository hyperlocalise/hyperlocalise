CREATE TYPE "public"."glossary_review_status" AS ENUM('proposed', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "glossary_concept_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"source_concept_id" uuid,
	"target_concept_id" uuid,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"concept_id" uuid,
	"term_id" uuid,
	"event_type" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_credential_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"reason" text,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"concept_id" uuid,
	"term_id" uuid,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "modified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "modified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concept_redirects" ADD CONSTRAINT "glossary_concept_redirects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concept_redirects" ADD CONSTRAINT "glossary_concept_redirects_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concept_redirects" ADD CONSTRAINT "glossary_concept_redirects_source_concept_id_glossary_concepts_id_fk" FOREIGN KEY ("source_concept_id") REFERENCES "public"."glossary_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concept_redirects" ADD CONSTRAINT "glossary_concept_redirects_target_concept_id_glossary_concepts_id_fk" FOREIGN KEY ("target_concept_id") REFERENCES "public"."glossary_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concept_redirects" ADD CONSTRAINT "glossary_concept_redirects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_concept_id_glossary_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."glossary_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_term_id_glossary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."glossary_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_review_comments" ADD CONSTRAINT "glossary_review_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_review_comments" ADD CONSTRAINT "glossary_review_comments_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_review_comments" ADD CONSTRAINT "glossary_review_comments_concept_id_glossary_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."glossary_concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_review_comments" ADD CONSTRAINT "glossary_review_comments_term_id_glossary_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."glossary_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_review_comments" ADD CONSTRAINT "glossary_review_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_concept_redirects_source" ON "glossary_concept_redirects" USING btree ("source_concept_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_concept_redirects_target" ON "glossary_concept_redirects" USING btree ("target_concept_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_history_events_glossary_occurred_at_id" ON "glossary_history_events" USING btree ("glossary_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "idx_glossary_history_events_concept_occurred_at" ON "glossary_history_events" USING btree ("concept_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_history_events_term_occurred_at" ON "glossary_history_events" USING btree ("term_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_review_comments_concept_created_at" ON "glossary_review_comments" USING btree ("concept_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_review_comments_term_created_at" ON "glossary_review_comments" USING btree ("term_id","created_at");--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_modified_by_user_id_users_id_fk" FOREIGN KEY ("modified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_modified_by_user_id_users_id_fk" FOREIGN KEY ("modified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_glossary_updated_at_id" ON "glossary_concepts" USING btree ("glossary_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_glossary_archived_at" ON "glossary_concepts" USING btree ("glossary_id","archived_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_created_by_user_id" ON "glossary_concepts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_reviewed_by_user_id" ON "glossary_concepts" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_glossary_updated_at_id" ON "glossary_terms" USING btree ("glossary_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_review_status" ON "glossary_terms" USING btree ("glossary_id","review_status");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_provenance" ON "glossary_terms" USING btree ("glossary_id","provenance");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_created_by_user_id" ON "glossary_terms" USING btree ("glossary_id","created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_reviewed_by_user_id" ON "glossary_terms" USING btree ("glossary_id","reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_archived_at" ON "glossary_terms" USING btree ("glossary_id","archived_at");
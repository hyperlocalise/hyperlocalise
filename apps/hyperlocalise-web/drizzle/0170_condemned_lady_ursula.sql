CREATE TABLE "engine_setup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"source_kind" text DEFAULT 'website' NOT NULL,
	"source_url" text NOT NULL,
	"source_locale" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress_stage" text,
	"pages_read" integer DEFAULT 0 NOT NULL,
	"workflow_run_id" text,
	"error_code" text,
	"error_message" text,
	"applied_glossary_id" uuid,
	"applied_knowledge_revision_id" uuid,
	"applied_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engine_setup_runs_pages_read_check" CHECK ("engine_setup_runs"."pages_read" >= 0)
);
--> statement-breakpoint
CREATE TABLE "engine_setup_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"conflict" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engine_setup_suggestions_confidence_check" CHECK ("engine_setup_suggestions"."confidence" >= 0 AND "engine_setup_suggestions"."confidence" <= 100)
);
--> statement-breakpoint
ALTER TABLE "engine_setup_runs" ADD CONSTRAINT "engine_setup_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_setup_runs" ADD CONSTRAINT "engine_setup_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_setup_runs" ADD CONSTRAINT "engine_setup_runs_applied_glossary_id_glossaries_id_fk" FOREIGN KEY ("applied_glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_setup_runs" ADD CONSTRAINT "engine_setup_runs_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_setup_suggestions" ADD CONSTRAINT "engine_setup_suggestions_run_id_engine_setup_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."engine_setup_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engine_setup_suggestions" ADD CONSTRAINT "engine_setup_suggestions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_engine_setup_runs_org_created_at" ON "engine_setup_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_engine_setup_runs_org_status" ON "engine_setup_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "engine_setup_suggestions_run_kind_dedupe_key" ON "engine_setup_suggestions" USING btree ("run_id","kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_engine_setup_suggestions_run_status" ON "engine_setup_suggestions" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "idx_engine_setup_suggestions_org" ON "engine_setup_suggestions" USING btree ("organization_id");
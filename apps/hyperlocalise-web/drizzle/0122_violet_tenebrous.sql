CREATE TABLE "translation_qa_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"translation_key_id" uuid,
	"translation_id" uuid,
	"source_path" text,
	"key" text NOT NULL,
	"target_locale" text NOT NULL,
	"check_type" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"related_tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_text" text NOT NULL,
	"target_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_qa_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_by_user_id" uuid,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"finding_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"summary" jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_scan_cadence" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "qa_scan_last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD CONSTRAINT "translation_qa_findings_run_id_translation_qa_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."translation_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD CONSTRAINT "translation_qa_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD CONSTRAINT "translation_qa_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD CONSTRAINT "translation_qa_findings_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD CONSTRAINT "translation_qa_findings_translation_id_project_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."project_translations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_runs" ADD CONSTRAINT "translation_qa_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_runs" ADD CONSTRAINT "translation_qa_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_runs" ADD CONSTRAINT "translation_qa_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_translation_qa_findings_run" ON "translation_qa_findings" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_translation_qa_findings_run_locale" ON "translation_qa_findings" USING btree ("run_id","target_locale");--> statement-breakpoint
CREATE INDEX "idx_translation_qa_findings_run_check" ON "translation_qa_findings" USING btree ("run_id","check_type");--> statement-breakpoint
CREATE INDEX "idx_translation_qa_runs_org_project_created" ON "translation_qa_runs" USING btree ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_translation_qa_runs_project_status" ON "translation_qa_runs" USING btree ("project_id","status");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_qa_scan_cadence_check" CHECK ("projects"."qa_scan_cadence" in ('off', 'daily'));
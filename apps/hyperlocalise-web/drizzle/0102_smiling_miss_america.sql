CREATE TABLE "glossary_import_report_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"source_row" integer,
	"concept_id" text,
	"term_id" text,
	"field" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"format" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"source_filename" text,
	"source_sha256" text,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"backup_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_import_report_entries" ADD CONSTRAINT "glossary_import_report_entries_run_id_glossary_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."glossary_import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD CONSTRAINT "glossary_import_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD CONSTRAINT "glossary_import_runs_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_import_runs" ADD CONSTRAINT "glossary_import_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_import_report_entries_run_id" ON "glossary_import_report_entries" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_import_runs_org_created_at" ON "glossary_import_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_import_runs_glossary_created_at" ON "glossary_import_runs" USING btree ("glossary_id","created_at");
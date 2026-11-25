CREATE TABLE "translation_quality_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"translation_id" uuid NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"target_locale" text NOT NULL,
	"score" integer NOT NULL,
	"reason" text NOT NULL,
	"source_hash" text NOT NULL,
	"target_hash" text NOT NULL,
	"domain" text NOT NULL,
	"estimator_version" integer NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translation_quality_estimates" ADD CONSTRAINT "translation_quality_estimates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_quality_estimates" ADD CONSTRAINT "translation_quality_estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_quality_estimates" ADD CONSTRAINT "translation_quality_estimates_translation_id_project_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."project_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_quality_estimates" ADD CONSTRAINT "translation_quality_estimates_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_quality_estimates" ADD CONSTRAINT "translation_quality_estimates_run_id_translation_qa_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."translation_qa_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "translation_quality_estimates_translation" ON "translation_quality_estimates" USING btree ("translation_id");--> statement-breakpoint
CREATE INDEX "idx_translation_quality_estimates_project_locale" ON "translation_quality_estimates" USING btree ("project_id","target_locale");
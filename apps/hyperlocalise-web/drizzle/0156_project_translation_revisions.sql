CREATE TABLE "project_translation_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"translation_id" uuid NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"target_locale" text NOT NULL,
	"text" text NOT NULL,
	"status" "project_translation_status" NOT NULL,
	"provenance" "project_translation_provenance" NOT NULL,
	"source_job_id" text,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"operation_id" text,
	"restored_from_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_translation_id_project_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."project_translations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD CONSTRAINT "project_translation_revisions_restored_from_revision_id_project_translation_revisions_id_fk" FOREIGN KEY ("restored_from_revision_id") REFERENCES "public"."project_translation_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_translation_revisions_translation" ON "project_translation_revisions" USING btree ("translation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_project_translation_revisions_operation" ON "project_translation_revisions" USING btree ("organization_id","project_id","operation_id");
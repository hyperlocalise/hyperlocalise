CREATE TABLE "external_job_details" (
	"job_id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"external_job_id" text NOT NULL,
	"external_task_id" text,
	"external_status" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"due_date" timestamp with time zone,
	"target_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_url" text,
	"sync_state" text DEFAULT 'pending' NOT NULL,
	"provider_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_job_details" ADD CONSTRAINT "external_job_details_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_job_details" ADD CONSTRAINT "external_job_details_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_job_details" ADD CONSTRAINT "external_job_details_linked_job_id_jobs_id_fk" FOREIGN KEY ("linked_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_external_job_details_provider_kind" ON "external_job_details" USING btree ("provider_kind");--> statement-breakpoint
CREATE INDEX "idx_external_job_details_external_job_id" ON "external_job_details" USING btree ("external_job_id");--> statement-breakpoint
CREATE INDEX "idx_external_job_details_sync_state" ON "external_job_details" USING btree ("sync_state");--> statement-breakpoint
CREATE INDEX "idx_external_job_details_linked_job" ON "external_job_details" USING btree ("linked_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_external_job_details_provider_job_unique" ON "external_job_details" USING btree ("organization_id","external_job_id","provider_kind");
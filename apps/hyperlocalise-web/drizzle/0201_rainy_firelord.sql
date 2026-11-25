CREATE TABLE "workflow_translation_job_idempotency_keys" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"job_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_translation_job_idempotency_keys_organization_id_key_pk" PRIMARY KEY("organization_id","key")
);
--> statement-breakpoint
ALTER TABLE "workflow_translation_job_idempotency_keys" ADD CONSTRAINT "workflow_translation_job_idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_translation_job_idempotency_keys" ADD CONSTRAINT "workflow_translation_job_idempotency_keys_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workflow_translation_job_idempotency_job" ON "workflow_translation_job_idempotency_keys" USING btree ("job_id");
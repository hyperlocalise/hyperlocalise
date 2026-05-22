DROP INDEX "idx_external_job_details_provider_job_unique";--> statement-breakpoint
ALTER TABLE "external_job_details" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "external_job_details" ADD CONSTRAINT "external_job_details_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_external_job_details_provider_job_unique" ON "external_job_details" USING btree ("organization_id","external_job_id","provider_kind");
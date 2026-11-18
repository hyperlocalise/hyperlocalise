ALTER TABLE "jobs" ADD COLUMN "after_job_id" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_after_job_id_jobs_id_fk" FOREIGN KEY ("after_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_after_job_id" ON "jobs" USING btree ("after_job_id") WHERE "jobs"."after_job_id" IS NOT NULL;
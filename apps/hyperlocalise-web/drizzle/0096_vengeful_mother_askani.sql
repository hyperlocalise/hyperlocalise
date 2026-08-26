CREATE TYPE "public"."job_assignee_type" AS ENUM('user', 'agent');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "assignee_type" "job_assignee_type";--> statement-breakpoint
CREATE INDEX "idx_jobs_assignee_type" ON "jobs" USING btree ("assignee_type");
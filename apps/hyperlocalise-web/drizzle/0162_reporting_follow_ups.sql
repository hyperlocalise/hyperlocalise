CREATE TABLE "reporting_task_analyses" (
	"organization_id" uuid NOT NULL,
	"job_id" text NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"incomplete" boolean DEFAULT false NOT NULL,
	"strings" integer,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_task_analyses_organization_id_job_id_step_pk" PRIMARY KEY("organization_id","job_id","step")
);
--> statement-breakpoint
ALTER TABLE "reporting_activity" DROP CONSTRAINT "reporting_activity_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "reporting_costs" DROP CONSTRAINT "reporting_costs_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "reporting_task_rates" DROP CONSTRAINT "reporting_task_rates_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "reporting_time_entries" DROP CONSTRAINT "reporting_time_entries_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "reporting_task_analyses" ADD CONSTRAINT "reporting_task_analyses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_task_analyses" ADD CONSTRAINT "reporting_task_analyses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_task_rates" ADD CONSTRAINT "reporting_task_rates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reporting_activity_job_step" ON "reporting_activity" USING btree ("organization_id","job_id","step") WHERE "reporting_activity"."kind" = 'completion';--> statement-breakpoint
CREATE INDEX "reporting_cost_job" ON "reporting_costs" USING btree ("organization_id","job_id");
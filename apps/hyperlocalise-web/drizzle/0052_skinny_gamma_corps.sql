CREATE TYPE "public"."job_assignee_role" AS ENUM('translator', 'reviewer');--> statement-breakpoint
CREATE TABLE "project_locale_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"locale" text NOT NULL,
	"role" "job_assignee_role" NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "assignee_role" "job_assignee_role";--> statement-breakpoint
ALTER TABLE "project_locale_assignments" ADD CONSTRAINT "project_locale_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_locale_assignments" ADD CONSTRAINT "project_locale_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_locale_assignments" ADD CONSTRAINT "project_locale_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_locale_assignments_project_locale_role_key" ON "project_locale_assignments" USING btree ("project_id","locale","role");--> statement-breakpoint
CREATE INDEX "idx_project_locale_assignments_org_project" ON "project_locale_assignments" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_locale_assignments_user_id" ON "project_locale_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_jobs_assignee_role" ON "jobs" USING btree ("assignee_role");
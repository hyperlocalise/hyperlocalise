CREATE TABLE "issue_sheet_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_sheet_activities" ADD CONSTRAINT "issue_sheet_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_activities" ADD CONSTRAINT "issue_sheet_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_activities" ADD CONSTRAINT "issue_sheet_activities_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_activities" ADD CONSTRAINT "issue_sheet_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_activities_issue_created" ON "issue_sheet_activities" USING btree ("issue_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_activities_org_project_issue" ON "issue_sheet_activities" USING btree ("organization_id","project_id","issue_id");
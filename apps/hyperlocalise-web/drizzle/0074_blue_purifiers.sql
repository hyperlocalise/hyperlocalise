CREATE TABLE "issue_sheet_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_sheet_subscriptions" ADD CONSTRAINT "issue_sheet_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_subscriptions" ADD CONSTRAINT "issue_sheet_subscriptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_subscriptions" ADD CONSTRAINT "issue_sheet_subscriptions_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_subscriptions" ADD CONSTRAINT "issue_sheet_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_subscriptions_issue_user_key" ON "issue_sheet_subscriptions" USING btree ("issue_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_subscriptions_user_org" ON "issue_sheet_subscriptions" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_subscriptions_issue" ON "issue_sheet_subscriptions" USING btree ("issue_id");
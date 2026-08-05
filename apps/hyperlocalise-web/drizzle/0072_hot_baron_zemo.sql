CREATE TABLE "issue_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"issue_id" uuid NOT NULL,
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_notifications_recipient_dedupe_key" ON "issue_notifications" USING btree ("recipient_user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_issue_notifications_recipient_org_created" ON "issue_notifications" USING btree ("recipient_user_id","organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_issue_notifications_recipient_org_unread" ON "issue_notifications" USING btree ("recipient_user_id","organization_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_issue_notifications_issue" ON "issue_notifications" USING btree ("issue_id");
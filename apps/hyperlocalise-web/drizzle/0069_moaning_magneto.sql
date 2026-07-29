CREATE TABLE "issue_sheet_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"parent_id" uuid,
	"path" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"mentioned_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mentioned_issue_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_sheet_comments" ADD CONSTRAINT "issue_sheet_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_comments" ADD CONSTRAINT "issue_sheet_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_comments" ADD CONSTRAINT "issue_sheet_comments_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_comments" ADD CONSTRAINT "issue_sheet_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_comments" ADD CONSTRAINT "issue_sheet_comments_parent_id_issue_sheet_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."issue_sheet_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_comments_issue_path_key" ON "issue_sheet_comments" USING btree ("issue_id","path");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_comments_issue_path" ON "issue_sheet_comments" USING btree ("issue_id","path");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_comments_issue_created" ON "issue_sheet_comments" USING btree ("issue_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_comments_org_project_issue" ON "issue_sheet_comments" USING btree ("organization_id","project_id","issue_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_comments_parent" ON "issue_sheet_comments" USING btree ("parent_id");
CREATE TABLE "issue_sheet_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"related_issue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_sheet_relationships" ADD CONSTRAINT "issue_sheet_relationships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_relationships" ADD CONSTRAINT "issue_sheet_relationships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_relationships" ADD CONSTRAINT "issue_sheet_relationships_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_relationships" ADD CONSTRAINT "issue_sheet_relationships_related_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("related_issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_relationships" ADD CONSTRAINT "issue_sheet_relationships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_relationships_issue_kind" ON "issue_sheet_relationships" USING btree ("issue_id","kind");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_relationships_related_kind" ON "issue_sheet_relationships" USING btree ("related_issue_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_relationships_edge_key" ON "issue_sheet_relationships" USING btree ("issue_id","related_issue_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_relationships_one_canonical_key" ON "issue_sheet_relationships" USING btree ("issue_id") WHERE "issue_sheet_relationships"."kind" = 'duplicate_of';
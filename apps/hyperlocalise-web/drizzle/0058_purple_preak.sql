CREATE TABLE "issue_sheet_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"layer" text DEFAULT 'custom' NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_sheet_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"issue_type" text DEFAULT 'general_question' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"target_locale" text,
	"source_path" text,
	"segment_id" text,
	"translation_key_id" uuid,
	"linked_comment_id" uuid,
	"linked_agent_run_id" uuid,
	"link_kind" text,
	"link_label" text,
	"link_url" text,
	"external_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reporter_user_id" uuid,
	"assignee_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "issue_sheet_row_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"value" jsonb,
	"computed_at" timestamp with time zone,
	"computed_by_agent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_sheet_columns" ADD CONSTRAINT "issue_sheet_columns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_columns" ADD CONSTRAINT "issue_sheet_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_columns" ADD CONSTRAINT "issue_sheet_columns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_linked_comment_id_project_translation_comments_id_fk" FOREIGN KEY ("linked_comment_id") REFERENCES "public"."project_translation_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_linked_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("linked_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_row_values" ADD CONSTRAINT "issue_sheet_row_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_row_values" ADD CONSTRAINT "issue_sheet_row_values_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_row_values" ADD CONSTRAINT "issue_sheet_row_values_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_row_values" ADD CONSTRAINT "issue_sheet_row_values_column_id_issue_sheet_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."issue_sheet_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_row_values" ADD CONSTRAINT "issue_sheet_row_values_computed_by_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("computed_by_agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_columns_project_key" ON "issue_sheet_columns" USING btree ("project_id","key");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_columns_org_project" ON "issue_sheet_columns" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_issues_org_project_status" ON "issue_sheet_issues" USING btree ("organization_id","project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_issues_project_locale" ON "issue_sheet_issues" USING btree ("project_id","target_locale");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_issues_linked_comment" ON "issue_sheet_issues" USING btree ("linked_comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_issues_project_external_ref_key" ON "issue_sheet_issues" USING btree ("project_id","external_ref") WHERE "issue_sheet_issues"."external_ref" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_row_values_issue_column" ON "issue_sheet_row_values" USING btree ("issue_id","column_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_row_values_org_project" ON "issue_sheet_row_values" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_row_values_column" ON "issue_sheet_row_values" USING btree ("column_id");
ALTER TABLE "issue_sheet_issues" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "issue_sheet_row_values" ALTER COLUMN "issue_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "identifier" text DEFAULT 'P' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9)) NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "issue_number_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD COLUMN "number" integer DEFAULT (floor(random() * 2147483646) + 1)::integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_identifier_key" ON "projects" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_issues_org_project_number" ON "issue_sheet_issues" USING btree ("organization_id","project_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_issues_project_number_key" ON "issue_sheet_issues" USING btree ("project_id","number");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_identifier_format_check" CHECK ("projects"."identifier" ~ '^[A-Z][A-Z0-9]{0,9}$');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_issue_number_seq_check" CHECK ("projects"."issue_number_seq" >= 0);--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_number_check" CHECK ("issue_sheet_issues"."number" >= 1);
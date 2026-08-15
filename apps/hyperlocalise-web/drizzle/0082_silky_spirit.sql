ALTER TABLE "projects" ADD COLUMN "issue_template_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD COLUMN "template_key" text;
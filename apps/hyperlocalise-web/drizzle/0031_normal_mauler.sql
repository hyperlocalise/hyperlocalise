CREATE TABLE "github_repository_automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_repository_id" uuid NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_repository_automation_settings" ADD CONSTRAINT "github_repository_automation_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_automation_settings" ADD CONSTRAINT "github_repository_automation_settings_github_installation_repository_id_github_installation_repositories_id_fk" FOREIGN KEY ("github_installation_repository_id") REFERENCES "public"."github_installation_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_repository_automation_settings_repo_key" ON "github_repository_automation_settings" USING btree ("github_installation_repository_id");--> statement-breakpoint
CREATE INDEX "idx_github_repository_automation_settings_org" ON "github_repository_automation_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_github_repository_automation_settings_next_run" ON "github_repository_automation_settings" USING btree ("next_run_at");
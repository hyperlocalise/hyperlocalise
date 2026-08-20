CREATE TABLE "github_auto_review_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_repository_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_auto_review_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"additional_prompt" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_auto_review_repositories" ADD CONSTRAINT "github_auto_review_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_auto_review_repositories" ADD CONSTRAINT "github_auto_review_repositories_github_installation_repository_id_github_installation_repositories_id_fk" FOREIGN KEY ("github_installation_repository_id") REFERENCES "public"."github_installation_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_auto_review_settings" ADD CONSTRAINT "github_auto_review_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_auto_review_repositories_org_repo_key" ON "github_auto_review_repositories" USING btree ("organization_id","github_installation_repository_id");--> statement-breakpoint
CREATE INDEX "idx_github_auto_review_repositories_org" ON "github_auto_review_repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_github_auto_review_repositories_repo" ON "github_auto_review_repositories" USING btree ("github_installation_repository_id");
CREATE TABLE "github_installation_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"default_branch" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_installation_repositories" ADD CONSTRAINT "github_installation_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installation_repositories" ADD CONSTRAINT "github_installation_repositories_github_installation_id_github_installations_github_installation_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("github_installation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_installation_repositories_github_repository_id_key" ON "github_installation_repositories" USING btree ("github_repository_id");--> statement-breakpoint
CREATE INDEX "idx_github_installation_repositories_org" ON "github_installation_repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_github_installation_repositories_installation" ON "github_installation_repositories" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "idx_github_installation_repositories_org_enabled" ON "github_installation_repositories" USING btree ("organization_id","enabled");
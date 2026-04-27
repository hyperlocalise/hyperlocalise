CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_app_id" bigint NOT NULL,
	"account_login" text,
	"account_type" text,
	"repositories" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_organization_id_key" ON "github_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_github_installation_id_key" ON "github_installations" USING btree ("github_installation_id");--> statement-breakpoint
CREATE INDEX "idx_github_installations_created_at" ON "github_installations" USING btree ("created_at");
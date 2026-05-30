CREATE TABLE "github_i18n_setup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"github_repository_id" bigint NOT NULL,
	"repository_full_name" text NOT NULL,
	"base_branch" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"error_message" text,
	"pull_request_url" text,
	"pull_request_number" integer,
	"detected_locale_count" integer,
	"workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_i18n_setup_runs" ADD CONSTRAINT "github_i18n_setup_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_i18n_setup_runs" ADD CONSTRAINT "github_i18n_setup_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_github_i18n_setup_runs_org_repo" ON "github_i18n_setup_runs" USING btree ("organization_id","github_repository_id");--> statement-breakpoint
CREATE INDEX "idx_github_i18n_setup_runs_status" ON "github_i18n_setup_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_github_i18n_setup_runs_created_at" ON "github_i18n_setup_runs" USING btree ("created_at");
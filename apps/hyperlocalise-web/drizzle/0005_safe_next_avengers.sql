CREATE TABLE "github_agent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_kind" text NOT NULL,
	"github_installation_id" bigint NOT NULL,
	"repository_full_name" text NOT NULL,
	"pull_request_number" integer NOT NULL,
	"comment_id" bigint NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"workflow_run_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "github_agent_requests_idempotency_key" ON "github_agent_requests" USING btree ("request_kind","github_installation_id","repository_full_name","pull_request_number","comment_id","scope_key");--> statement-breakpoint
CREATE INDEX "idx_github_agent_requests_installation_repo" ON "github_agent_requests" USING btree ("github_installation_id","repository_full_name");--> statement-breakpoint
CREATE INDEX "idx_github_agent_requests_created_at" ON "github_agent_requests" USING btree ("created_at");
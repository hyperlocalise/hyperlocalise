CREATE TABLE "mcp_auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"mcp_code_challenge" text NOT NULL,
	"mcp_redirect_uri" text NOT NULL,
	"workos_code_verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_mcp_sessions_access_token_hash";--> statement-breakpoint
DROP INDEX "idx_mcp_sessions_refresh_token_hash";--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD COLUMN "refresh_token_expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_mcp_auth_codes_expires_at" ON "mcp_auth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_mcp_oauth_states_expires_at" ON "mcp_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_sessions_access_token_hash_key" ON "mcp_sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_sessions_refresh_token_hash_key" ON "mcp_sessions" USING btree ("refresh_token_hash");
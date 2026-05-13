CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text,
	"redirect_uris" jsonb NOT NULL,
	"grant_types" jsonb DEFAULT '["authorization_code","refresh_token"]'::jsonb NOT NULL,
	"response_types" jsonb DEFAULT '["code"]'::jsonb NOT NULL,
	"scope" text DEFAULT 'mcp' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" text DEFAULT 'mcp' NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"workos_access_token_encrypted" text,
	"workos_refresh_token_encrypted" text,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "used_authorization_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD CONSTRAINT "mcp_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mcp_oauth_clients_created_at" ON "mcp_oauth_clients" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_sessions_access_token_hash_key" ON "mcp_sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_sessions_refresh_token_hash_key" ON "mcp_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "idx_mcp_sessions_user_id" ON "mcp_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_sessions_organization_id" ON "mcp_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_sessions_expires_at" ON "mcp_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_used_authorization_codes_expires_at" ON "used_authorization_codes" USING btree ("expires_at");
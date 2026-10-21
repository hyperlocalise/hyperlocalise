CREATE TABLE "sanity_plugin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanity_plugin_oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"studio_origin" text NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanity_plugin_oauth_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"read_key_hash" text NOT NULL,
	"write_key_hash" text NOT NULL,
	"studio_origin" text NOT NULL,
	"code" text,
	"error" text,
	"error_description" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanity_plugin_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"studio_origin" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sanity_plugin_connections" ADD CONSTRAINT "sanity_plugin_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_connections" ADD CONSTRAINT "sanity_plugin_connections_api_key_id_organization_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."organization_api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_connections" ADD CONSTRAINT "sanity_plugin_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_connections" ADD CONSTRAINT "sanity_plugin_connections_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_authorization_codes" ADD CONSTRAINT "sanity_plugin_oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_authorization_codes" ADD CONSTRAINT "sanity_plugin_oauth_authorization_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_authorization_codes" ADD CONSTRAINT "sanity_plugin_oauth_authorization_codes_connection_id_sanity_plugin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."sanity_plugin_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_tokens" ADD CONSTRAINT "sanity_plugin_oauth_tokens_connection_id_sanity_plugin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."sanity_plugin_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_tokens" ADD CONSTRAINT "sanity_plugin_oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_tokens" ADD CONSTRAINT "sanity_plugin_oauth_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_connections_org" ON "sanity_plugin_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_connections_api_key" ON "sanity_plugin_connections" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sanity_plugin_oauth_authorization_codes_code_hash_key" ON "sanity_plugin_oauth_authorization_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_oauth_authorization_codes_expires" ON "sanity_plugin_oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_oauth_authorization_codes_connection" ON "sanity_plugin_oauth_authorization_codes" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sanity_plugin_oauth_handoffs_read_key_hash_key" ON "sanity_plugin_oauth_handoffs" USING btree ("read_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sanity_plugin_oauth_handoffs_write_key_hash_key" ON "sanity_plugin_oauth_handoffs" USING btree ("write_key_hash");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_oauth_handoffs_expires" ON "sanity_plugin_oauth_handoffs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sanity_plugin_oauth_tokens_access_token_hash_key" ON "sanity_plugin_oauth_tokens" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sanity_plugin_oauth_tokens_refresh_token_hash_key" ON "sanity_plugin_oauth_tokens" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_oauth_tokens_connection" ON "sanity_plugin_oauth_tokens" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_oauth_tokens_org" ON "sanity_plugin_oauth_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_sanity_plugin_oauth_tokens_studio_origin" ON "sanity_plugin_oauth_tokens" USING btree ("studio_origin");
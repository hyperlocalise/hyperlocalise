CREATE TABLE "canva_connection_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_token_hash" text NOT NULL,
	"organization_id" uuid,
	"connection_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"encryption_algorithm" text,
	"ciphertext" text,
	"iv" text,
	"auth_tag" text,
	"key_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canva_oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canva_oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canva_connection_claims" ADD CONSTRAINT "canva_connection_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_connection_claims" ADD CONSTRAINT "canva_connection_claims_connection_id_canva_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."canva_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_oauth_authorization_codes" ADD CONSTRAINT "canva_oauth_authorization_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_oauth_authorization_codes" ADD CONSTRAINT "canva_oauth_authorization_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_oauth_authorization_codes" ADD CONSTRAINT "canva_oauth_authorization_codes_connection_id_canva_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."canva_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_oauth_tokens" ADD CONSTRAINT "canva_oauth_tokens_connection_id_canva_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."canva_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_oauth_tokens" ADD CONSTRAINT "canva_oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_oauth_tokens" ADD CONSTRAINT "canva_oauth_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canva_connection_claims_poll_token_hash_key" ON "canva_connection_claims" USING btree ("poll_token_hash");--> statement-breakpoint
CREATE INDEX "idx_canva_connection_claims_org" ON "canva_connection_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_canva_connection_claims_expires" ON "canva_connection_claims" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "canva_oauth_authorization_codes_code_hash_key" ON "canva_oauth_authorization_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "idx_canva_oauth_authorization_codes_expires" ON "canva_oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_canva_oauth_authorization_codes_connection" ON "canva_oauth_authorization_codes" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canva_oauth_tokens_access_token_hash_key" ON "canva_oauth_tokens" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "canva_oauth_tokens_refresh_token_hash_key" ON "canva_oauth_tokens" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "idx_canva_oauth_tokens_connection" ON "canva_oauth_tokens" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_canva_oauth_tokens_org" ON "canva_oauth_tokens" USING btree ("organization_id");
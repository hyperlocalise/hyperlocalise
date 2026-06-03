CREATE TABLE "crowdin_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"code_verifier" text NOT NULL,
	"oauth_client_id" text NOT NULL,
	"oauth_client_secret_encryption_algorithm" text NOT NULL,
	"oauth_client_secret_ciphertext" text NOT NULL,
	"oauth_client_secret_iv" text NOT NULL,
	"oauth_client_secret_auth_tag" text NOT NULL,
	"oauth_client_secret_key_version" integer DEFAULT 1 NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"base_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_external_tms_provider_credentials" ADD COLUMN "auth_mode" text DEFAULT 'api_token' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_external_tms_provider_credentials" ADD COLUMN "oauth_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crowdin_oauth_states" ADD CONSTRAINT "crowdin_oauth_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowdin_oauth_states" ADD CONSTRAINT "crowdin_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crowdin_oauth_states_nonce_key" ON "crowdin_oauth_states" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "idx_crowdin_oauth_states_org_user" ON "crowdin_oauth_states" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_crowdin_oauth_states_expires_at" ON "crowdin_oauth_states" USING btree ("expires_at");
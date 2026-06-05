CREATE TABLE "lokalise_user_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_credential_id" uuid NOT NULL,
	"lokalise_user_id" integer NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"full_name" text,
	"oauth_expires_at" timestamp with time zone,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lokalise_user_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_credential_id" uuid NOT NULL,
	"return_to" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lokalise_user_connections" ADD CONSTRAINT "lokalise_user_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lokalise_user_connections" ADD CONSTRAINT "lokalise_user_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lokalise_user_connections" ADD CONSTRAINT "lokalise_user_connections_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lokalise_user_oauth_states" ADD CONSTRAINT "lokalise_user_oauth_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lokalise_user_oauth_states" ADD CONSTRAINT "lokalise_user_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lokalise_user_oauth_states" ADD CONSTRAINT "lokalise_user_oauth_states_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lokalise_user_connections_org_user_key" ON "lokalise_user_connections" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lokalise_user_connections_org_lokalise_user_key" ON "lokalise_user_connections" USING btree ("organization_id","lokalise_user_id");--> statement-breakpoint
CREATE INDEX "idx_lokalise_user_connections_provider_credential" ON "lokalise_user_connections" USING btree ("provider_credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lokalise_user_oauth_states_nonce_key" ON "lokalise_user_oauth_states" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "idx_lokalise_user_oauth_states_org_user" ON "lokalise_user_oauth_states" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_lokalise_user_oauth_states_expires_at" ON "lokalise_user_oauth_states" USING btree ("expires_at");
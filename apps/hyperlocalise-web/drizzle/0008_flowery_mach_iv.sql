CREATE TYPE "public"."external_tms_provider_kind" AS ENUM('crowdin', 'smartling', 'phrase', 'lokalise');--> statement-breakpoint
CREATE TABLE "organization_external_tms_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"display_name" text NOT NULL,
	"region" text,
	"base_url" text,
	"validation_status" text DEFAULT 'unvalidated' NOT NULL,
	"validation_message" text,
	"last_validated_at" timestamp with time zone,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"masked_secret_suffix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_external_tms_provider_credentials" ADD CONSTRAINT "organization_external_tms_provider_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_external_tms_provider_credentials" ADD CONSTRAINT "organization_external_tms_provider_credentials_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_external_tms_provider_credentials" ADD CONSTRAINT "organization_external_tms_provider_credentials_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_external_tms_provider_credentials_org_provider_kind_key" ON "organization_external_tms_provider_credentials" USING btree ("organization_id","provider_kind");--> statement-breakpoint
CREATE INDEX "idx_organization_external_tms_provider_credentials_updated_at" ON "organization_external_tms_provider_credentials" USING btree ("updated_at");
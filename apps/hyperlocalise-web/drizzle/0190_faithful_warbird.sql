CREATE TYPE "public"."ota_release_status" AS ENUM('in_progress', 'success', 'failed');--> statement-breakpoint
CREATE TABLE "organization_cdn_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bucket" text NOT NULL,
	"region" text NOT NULL,
	"endpoint" text,
	"public_base_url" text NOT NULL,
	"use_path_style" boolean DEFAULT false NOT NULL,
	"masked_secret_suffix" text NOT NULL,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"validation_status" text DEFAULT 'unvalidated' NOT NULL,
	"validation_message" text,
	"last_validated_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_cdn_destinations_name_not_blank_check" CHECK (char_length(btrim("organization_cdn_destinations"."name")) > 0),
	CONSTRAINT "organization_cdn_destinations_bucket_not_blank_check" CHECK (char_length(btrim("organization_cdn_destinations"."bucket")) > 0),
	CONSTRAINT "organization_cdn_destinations_region_not_blank_check" CHECK (char_length(btrim("organization_cdn_destinations"."region")) > 0)
);
--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD COLUMN "destination_id" uuid;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN "status" "ota_release_status" DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "organization_cdn_destinations" ADD CONSTRAINT "organization_cdn_destinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_cdn_destinations" ADD CONSTRAINT "organization_cdn_destinations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_cdn_destinations" ADD CONSTRAINT "organization_cdn_destinations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_organization_cdn_destinations_org" ON "organization_cdn_destinations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_cdn_destinations_org_name_key" ON "organization_cdn_destinations" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD CONSTRAINT "ota_distributions_destination_id_organization_cdn_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."organization_cdn_destinations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ota_distributions_destination_id" ON "ota_distributions" USING btree ("destination_id");
CREATE TYPE "public"."ota_distribution_format" AS ENUM('json', 'android_xml', 'ios_strings');--> statement-breakpoint
CREATE TABLE "ota_distributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"public_hash" text NOT NULL,
	"file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"format" "ota_distribution_format" NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ota_distributions_public_hash_format_check" CHECK ("ota_distributions"."public_hash" ~ '^[0-9a-f]{32}$'),
	CONSTRAINT "ota_distributions_name_not_blank_check" CHECK (char_length(btrim("ota_distributions"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ota_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"artifact_pointer" text,
	"manifest" jsonb NOT NULL,
	"released_by_user_id" uuid,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ota_releases_sequence_check" CHECK ("ota_releases"."sequence" >= 1)
);
--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD CONSTRAINT "ota_distributions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD CONSTRAINT "ota_distributions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD CONSTRAINT "ota_distributions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD CONSTRAINT "ota_distributions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_distribution_id_ota_distributions_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "public"."ota_distributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_released_by_user_id_users_id_fk" FOREIGN KEY ("released_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ota_distributions_public_hash_key" ON "ota_distributions" USING btree ("public_hash");--> statement-breakpoint
CREATE INDEX "idx_ota_distributions_project_id" ON "ota_distributions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_ota_distributions_org" ON "ota_distributions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_ota_distributions_project_revoked" ON "ota_distributions" USING btree ("project_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ota_releases_distribution_sequence_key" ON "ota_releases" USING btree ("distribution_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_ota_releases_distribution_released_at" ON "ota_releases" USING btree ("distribution_id","released_at");--> statement-breakpoint
CREATE INDEX "idx_ota_releases_org" ON "ota_releases" USING btree ("organization_id");
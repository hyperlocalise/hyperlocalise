CREATE TABLE "crowdin_app_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crowdin_organization_id" integer NOT NULL,
	"crowdin_domain" text,
	"crowdin_base_url" text NOT NULL,
	"crowdin_user_id" integer NOT NULL,
	"app_id" text NOT NULL,
	"app_secret_encryption_algorithm" text NOT NULL,
	"app_secret_ciphertext" text NOT NULL,
	"app_secret_iv" text NOT NULL,
	"app_secret_auth_tag" text NOT NULL,
	"app_secret_key_version" integer DEFAULT 1 NOT NULL,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_external_tms_provider_credentials" ADD COLUMN "external_organization_id" text;--> statement-breakpoint
ALTER TABLE "crowdin_app_installations" ADD CONSTRAINT "crowdin_app_installations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crowdin_app_installations_crowdin_org_key" ON "crowdin_app_installations" USING btree ("crowdin_organization_id");--> statement-breakpoint
CREATE INDEX "idx_crowdin_app_installations_organization" ON "crowdin_app_installations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_external_tms_provider_credentials_provider_ext_org_key" ON "organization_external_tms_provider_credentials" USING btree ("provider_kind","external_organization_id") WHERE "organization_external_tms_provider_credentials"."external_organization_id" IS NOT NULL;
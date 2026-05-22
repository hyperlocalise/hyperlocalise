CREATE TYPE "public"."project_source" AS ENUM('native', 'external_tms');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source" "project_source" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_provider_kind" "external_tms_provider_kind";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_provider_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_project_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_locale" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "target_locales" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_project_url" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_sync_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "last_sync_error_message" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_external_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("external_provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_provider_external_project_key" ON "projects" USING btree ("organization_id","external_provider_kind","external_project_id");
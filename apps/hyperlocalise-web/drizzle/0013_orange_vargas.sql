CREATE TYPE "public"."external_tms_resource_type" AS ENUM('file', 'key');--> statement-breakpoint
CREATE TABLE "external_tms_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"provider_credential_id" uuid,
	"provider_kind" "external_tms_provider_kind" NOT NULL,
	"external_project_id" text NOT NULL,
	"resource_type" "external_tms_resource_type" NOT NULL,
	"external_resource_id" text NOT NULL,
	"source_path" text NOT NULL,
	"display_name" text NOT NULL,
	"format" text,
	"source_locale" text,
	"target_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_hash" text,
	"revision" text,
	"stored_file_id" text,
	"external_url" text,
	"sync_state" text DEFAULT 'pending' NOT NULL,
	"locale_readiness" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_tms_files" ADD CONSTRAINT "external_tms_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_tms_files" ADD CONSTRAINT "external_tms_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_tms_files" ADD CONSTRAINT "external_tms_files_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_tms_files" ADD CONSTRAINT "external_tms_files_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_tms_files_provider_resource_key" ON "external_tms_files" USING btree ("organization_id","provider_kind","external_project_id","resource_type","external_resource_id");--> statement-breakpoint
CREATE INDEX "idx_external_tms_files_org_project_path" ON "external_tms_files" USING btree ("organization_id","project_id","source_path");--> statement-breakpoint
CREATE INDEX "idx_external_tms_files_provider_project" ON "external_tms_files" USING btree ("organization_id","provider_kind","external_project_id");--> statement-breakpoint
CREATE INDEX "idx_external_tms_files_stored_file" ON "external_tms_files" USING btree ("stored_file_id");--> statement-breakpoint
CREATE INDEX "idx_external_tms_files_sync_state" ON "external_tms_files" USING btree ("sync_state");
CREATE TYPE "public"."external_tms_terminology_resource_type" AS ENUM('glossary', 'term_base');--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "source" "project_source" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "external_provider_kind" "external_tms_provider_kind";--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "external_provider_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "external_project_id" text;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "external_resource_type" "external_tms_terminology_resource_type";--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "external_glossary_id" text;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "locale_coverage" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "term_count" integer;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "sync_state" text;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "term_capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "last_sync_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "last_sync_error_message" text;--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "provenance" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossaries" ADD CONSTRAINT "glossaries_external_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("external_provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "glossaries_org_provider_external_resource_key" ON "glossaries" USING btree ("organization_id","external_provider_kind","external_project_id","external_resource_type","external_glossary_id","source_locale","target_locale");--> statement-breakpoint
CREATE INDEX "idx_glossaries_sync_state" ON "glossaries" USING btree ("sync_state");--> statement-breakpoint
CREATE INDEX "idx_glossaries_external_provider" ON "glossaries" USING btree ("organization_id","external_provider_kind","external_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_terms_glossary_external_key" ON "glossary_terms" USING btree ("glossary_id","external_key");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_external_key" ON "glossary_terms" USING btree ("external_key");
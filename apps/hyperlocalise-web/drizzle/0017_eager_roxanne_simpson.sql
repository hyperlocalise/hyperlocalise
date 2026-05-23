ALTER TABLE "memories" ADD COLUMN "source" "project_source" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "external_provider_kind" "external_tms_provider_kind";--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "external_provider_credential_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "external_project_id" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "external_memory_id" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "locale_coverage" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "segment_count" integer;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "sync_state" "glossary_sync_state";--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "external_url" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_sync_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "last_sync_error_message" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_external_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("external_provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memories_org_provider_external_memory_key" ON "memories" USING btree ("organization_id","external_provider_kind","external_project_id","external_memory_id");--> statement-breakpoint
CREATE INDEX "idx_memories_sync_state" ON "memories" USING btree ("sync_state");--> statement-breakpoint
CREATE INDEX "idx_memories_external_provider" ON "memories" USING btree ("organization_id","external_provider_kind","external_project_id");
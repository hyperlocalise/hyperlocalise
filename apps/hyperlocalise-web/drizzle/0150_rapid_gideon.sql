CREATE TABLE "figma_oauth_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"read_key_hash" text NOT NULL,
	"write_key_hash" text NOT NULL,
	"code" text,
	"error" text,
	"error_description" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "figma_connections" DROP CONSTRAINT "figma_connections_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "idx_figma_connections_project";--> statement-breakpoint
CREATE UNIQUE INDEX "figma_oauth_handoffs_read_key_hash_key" ON "figma_oauth_handoffs" USING btree ("read_key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "figma_oauth_handoffs_write_key_hash_key" ON "figma_oauth_handoffs" USING btree ("write_key_hash");--> statement-breakpoint
CREATE INDEX "idx_figma_oauth_handoffs_expires" ON "figma_oauth_handoffs" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "figma_connections" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "figma_connections" DROP COLUMN "source_locale";--> statement-breakpoint
ALTER TABLE "figma_connections" DROP COLUMN "target_locales";
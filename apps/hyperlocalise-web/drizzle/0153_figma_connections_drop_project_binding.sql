ALTER TABLE "figma_connections" DROP CONSTRAINT IF EXISTS "figma_connections_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "figma_connections" DROP COLUMN IF EXISTS "project_id";
--> statement-breakpoint
ALTER TABLE "figma_connections" DROP COLUMN IF EXISTS "source_locale";
--> statement-breakpoint
ALTER TABLE "figma_connections" DROP COLUMN IF EXISTS "target_locales";

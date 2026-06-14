ALTER TABLE "contentful_connections" DROP CONSTRAINT "contentful_connections_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "idx_contentful_connections_project";
--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ADD COLUMN "project_id" text;
--> statement-breakpoint
UPDATE "contentful_translation_runs" AS runs
SET "project_id" = connections."project_id"
FROM "contentful_connections" AS connections
WHERE runs."connection_id" = connections."id"
  AND runs."project_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "contentful_translation_runs" ADD CONSTRAINT "contentful_translation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_contentful_translation_runs_project" ON "contentful_translation_runs" USING btree ("project_id");
--> statement-breakpoint
ALTER TABLE "contentful_connections" DROP COLUMN "project_id";
--> statement-breakpoint
ALTER TABLE "contentful_connections" DROP COLUMN "source_locale";
--> statement-breakpoint
ALTER TABLE "contentful_connections" DROP COLUMN "target_locales";

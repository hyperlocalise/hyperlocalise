ALTER TABLE "conversations" DROP CONSTRAINT "conversations_project_id_translation_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_project_id_translation_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "jobs" DROP CONSTRAINT "jobs_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" DROP CONSTRAINT "translation_project_glossaries_project_id_translation_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" DROP CONSTRAINT "translation_project_glossaries_glossary_id_translation_glossaries_id_fk";
--> statement-breakpoint
ALTER TABLE "translation_project_memories" DROP CONSTRAINT "translation_project_memories_project_id_translation_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "translation_project_memories" DROP CONSTRAINT "translation_project_memories_translation_memory_id_translation_memories_id_fk";
--> statement-breakpoint
DROP INDEX "conversations_source_thread_id_key";
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
UPDATE "translation_project_glossaries" "attachment"
SET "organization_id" = "project"."organization_id"
FROM "translation_projects" "project"
WHERE "attachment"."project_id" = "project"."id";
--> statement-breakpoint
UPDATE "translation_project_memories" "attachment"
SET "organization_id" = "project"."organization_id"
FROM "translation_projects" "project"
WHERE "attachment"."project_id" = "project"."id";
--> statement-breakpoint
DELETE FROM "translation_project_glossaries" "attachment"
USING "translation_glossaries" "glossary"
WHERE "attachment"."glossary_id" = "glossary"."id"
  AND "attachment"."organization_id" IS DISTINCT FROM "glossary"."organization_id";
--> statement-breakpoint
DELETE FROM "translation_project_memories" "attachment"
USING "translation_memories" "memory"
WHERE "attachment"."translation_memory_id" = "memory"."id"
  AND "attachment"."organization_id" IS DISTINCT FROM "memory"."organization_id";
--> statement-breakpoint
DELETE FROM "translation_project_glossaries" WHERE "organization_id" IS NULL;
--> statement-breakpoint
DELETE FROM "translation_project_memories" WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "conversations" "conversation"
SET "project_id" = NULL
WHERE "project_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "translation_projects" "project"
    WHERE "project"."id" = "conversation"."project_id"
      AND "project"."organization_id" = "conversation"."organization_id"
  );
--> statement-breakpoint
UPDATE "jobs" "job"
SET "project_id" = NULL
WHERE "project_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "translation_projects" "project"
    WHERE "project"."id" = "job"."project_id"
      AND "project"."organization_id" = "job"."organization_id"
  );
--> statement-breakpoint
UPDATE "jobs" "job"
SET "conversation_id" = NULL
WHERE "conversation_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "conversations" "conversation"
    WHERE "conversation"."id" = "job"."conversation_id"
      AND "conversation"."organization_id" = "job"."organization_id"
  );
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "translation_project_memories" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "translation_projects_id_organization_id_key" ON "translation_projects" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "translation_glossaries_id_organization_id_key" ON "translation_glossaries" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "translation_memories_id_organization_id_key" ON "translation_memories" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_organization_id_key" ON "conversations" USING btree ("id","organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_source_thread_id_key" ON "conversations" USING btree ("organization_id","source","source_thread_id") WHERE "conversations"."source_thread_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_translation_project_glossaries_org" ON "translation_project_glossaries" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "idx_translation_project_memories_org" ON "translation_project_memories" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_conversation_org_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_project_glossaries" ADD CONSTRAINT "translation_project_glossaries_glossary_org_fk" FOREIGN KEY ("glossary_id","organization_id") REFERENCES "public"."translation_glossaries"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_project_org_fk" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."translation_projects"("id","organization_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_project_memories" ADD CONSTRAINT "translation_project_memories_memory_org_fk" FOREIGN KEY ("translation_memory_id","organization_id") REFERENCES "public"."translation_memories"("id","organization_id") ON DELETE cascade ON UPDATE no action;

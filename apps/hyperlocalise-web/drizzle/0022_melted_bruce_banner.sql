CREATE TYPE "public"."organization_lifecycle_status" AS ENUM('active', 'archived', 'deprecated');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lifecycle_status" "organization_lifecycle_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
UPDATE "organizations"
SET "lifecycle_status" = 'deprecated',
    "archived_at" = now(),
    "updated_at" = now()
WHERE "workos_organization_id" LIKE 'local_org_%';
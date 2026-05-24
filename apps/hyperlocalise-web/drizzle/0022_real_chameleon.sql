CREATE TYPE "public"."organization_lifecycle_status" AS ENUM('active', 'archived', 'deprecated');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "lifecycle_status" "organization_lifecycle_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "archived_at" timestamp with time zone;
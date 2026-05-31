ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE "organization_memberships" SET "role" = 'admin' WHERE "role" = 'owner';--> statement-breakpoint
ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DEFAULT 'member'::text;--> statement-breakpoint
DROP TYPE "public"."organization_membership_role";--> statement-breakpoint
CREATE TYPE "public"."organization_membership_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DEFAULT 'member'::"public"."organization_membership_role";--> statement-breakpoint
ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DATA TYPE "public"."organization_membership_role" USING "role"::"public"."organization_membership_role";
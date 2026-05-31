ALTER TYPE "public"."organization_membership_role" ADD VALUE 'localization_manager' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_membership_role" ADD VALUE 'developer' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_membership_role" ADD VALUE 'reviewer' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."organization_membership_role" ADD VALUE 'translator' BEFORE 'member';
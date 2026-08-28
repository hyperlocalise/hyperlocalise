CREATE TYPE "public"."glossary_control_level" AS ENUM('org', 'team');--> statement-breakpoint
ALTER TABLE "glossaries" ADD COLUMN "control_level" "glossary_control_level" DEFAULT 'org' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossaries" ADD CONSTRAINT "glossaries_team_control_is_native" CHECK ("glossaries"."control_level" <> 'team' OR "glossaries"."source" = 'native');
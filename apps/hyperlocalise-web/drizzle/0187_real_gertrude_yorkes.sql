CREATE TABLE "project_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"base_branch_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"merged_at" timestamp with time zone,
	"merged_into_branch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_branches_status_check" CHECK ("project_branches"."status" in ('active', 'merged')),
	CONSTRAINT "project_branches_name_check" CHECK (char_length("project_branches"."name") between 1 and 128 and "project_branches"."name" !~ '[^A-Za-z0-9._/-]' and "project_branches"."name" !~ '^[./-]' and "project_branches"."name" !~ '[./-]$' and "project_branches"."name" !~ '//')
);
--> statement-breakpoint
DROP INDEX "repository_source_file_versions_stored_file_key";--> statement-breakpoint
DROP INDEX "repository_source_files_project_path_key";--> statement-breakpoint
ALTER TABLE "repository_source_files" ADD COLUMN "branch_name" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "branch_name" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_branches" ADD CONSTRAINT "project_branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_branches" ADD CONSTRAINT "project_branches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_branches" ADD CONSTRAINT "project_branches_base_branch_id_project_branches_id_fk" FOREIGN KEY ("base_branch_id") REFERENCES "public"."project_branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_branches" ADD CONSTRAINT "project_branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_branches" ADD CONSTRAINT "project_branches_merged_into_branch_id_project_branches_id_fk" FOREIGN KEY ("merged_into_branch_id") REFERENCES "public"."project_branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_branches_project_active_name_key" ON "project_branches" USING btree ("project_id","name") WHERE "project_branches"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "project_branches_project_default_key" ON "project_branches" USING btree ("project_id") WHERE "project_branches"."is_default";--> statement-breakpoint
CREATE INDEX "idx_project_branches_org_project" ON "project_branches" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_branches_base" ON "project_branches" USING btree ("base_branch_id");--> statement-breakpoint
CREATE INDEX "idx_repository_source_file_versions_stored_file" ON "repository_source_file_versions" USING btree ("stored_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_source_files_project_branch_path_key" ON "repository_source_files" USING btree ("project_id","branch_name","source_path");--> statement-breakpoint
CREATE INDEX "idx_project_translation_keys_project_branch" ON "project_translation_keys" USING btree ("project_id","branch_name");
--> statement-breakpoint
INSERT INTO "project_branches" ("organization_id", "project_id", "name", "is_default", "created_by_user_id")
SELECT p."organization_id", p."id", 'main', true, p."created_by_user_id"
FROM "projects" p
WHERE p."source" = 'native'
  AND NOT EXISTS (
    SELECT 1 FROM "project_branches" b
    WHERE b."project_id" = p."id" AND b."name" = 'main' AND b."status" = 'active'
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION native_project_default_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source = 'native' THEN
    INSERT INTO project_branches (organization_id, project_id, name, is_default, created_by_user_id)
    SELECT NEW.organization_id, NEW.id, 'main', true, NEW.created_by_user_id
    WHERE NOT EXISTS (
      SELECT 1 FROM project_branches
      WHERE project_id = NEW.id AND name = 'main' AND status = 'active'
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS native_project_default_branch_trigger ON projects;
--> statement-breakpoint
CREATE TRIGGER native_project_default_branch_trigger
AFTER INSERT ON projects
FOR EACH ROW
EXECUTE FUNCTION native_project_default_branch();
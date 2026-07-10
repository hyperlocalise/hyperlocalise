CREATE TABLE "project_cat_string_overlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"source_path" text NOT NULL,
	"external_string_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_cat_string_overlays" ADD CONSTRAINT "project_cat_string_overlays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cat_string_overlays" ADD CONSTRAINT "project_cat_string_overlays_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_cat_string_overlays_lookup" ON "project_cat_string_overlays" USING btree ("organization_id","project_id","source_path","external_string_id");--> statement-breakpoint
CREATE INDEX "idx_project_cat_string_overlays_file" ON "project_cat_string_overlays" USING btree ("organization_id","project_id","source_path");
CREATE TABLE "project_visual_context_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"screenshot_id" uuid NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"marker_left" double precision,
	"marker_top" double precision,
	"marker_width" double precision,
	"marker_height" double precision,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_visual_context_bindings_marker_check" CHECK ((
        "project_visual_context_bindings"."marker_left" is null
        and "project_visual_context_bindings"."marker_top" is null
        and "project_visual_context_bindings"."marker_width" is null
        and "project_visual_context_bindings"."marker_height" is null
      ) or (
        "project_visual_context_bindings"."marker_left" is not null
        and "project_visual_context_bindings"."marker_top" is not null
        and "project_visual_context_bindings"."marker_width" is not null
        and "project_visual_context_bindings"."marker_height" is not null
        and "project_visual_context_bindings"."marker_left" >= 0 and "project_visual_context_bindings"."marker_left" <= 100
        and "project_visual_context_bindings"."marker_top" >= 0 and "project_visual_context_bindings"."marker_top" <= 100
        and "project_visual_context_bindings"."marker_width" > 0 and "project_visual_context_bindings"."marker_width" <= 100
        and "project_visual_context_bindings"."marker_height" > 0 and "project_visual_context_bindings"."marker_height" <= 100
      ))
);
--> statement-breakpoint
CREATE TABLE "project_visual_context_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"stored_file_id" text,
	"name" text,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"object_location" text NOT NULL,
	"object_key" text NOT NULL,
	"status" text DEFAULT 'upload_pending' NOT NULL,
	"width" integer,
	"height" integer,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_visual_context_screenshots_status_check" CHECK ("project_visual_context_screenshots"."status" in ('upload_pending', 'ready')),
	CONSTRAINT "project_visual_context_screenshots_ready_file_check" CHECK (("project_visual_context_screenshots"."status" = 'upload_pending' and "project_visual_context_screenshots"."stored_file_id" is null) or ("project_visual_context_screenshots"."status" = 'ready' and "project_visual_context_screenshots"."stored_file_id" is not null)),
	CONSTRAINT "project_visual_context_screenshots_content_type_check" CHECK ("project_visual_context_screenshots"."content_type" in ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_screenshot_id_project_visual_context_screenshots_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."project_visual_context_screenshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_screenshots" ADD CONSTRAINT "project_visual_context_screenshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_screenshots" ADD CONSTRAINT "project_visual_context_screenshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_screenshots" ADD CONSTRAINT "project_visual_context_screenshots_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_screenshots" ADD CONSTRAINT "project_visual_context_screenshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_visual_context_bindings_screenshot_key" ON "project_visual_context_bindings" USING btree ("screenshot_id","translation_key_id");--> statement-breakpoint
CREATE INDEX "idx_project_visual_context_bindings_key" ON "project_visual_context_bindings" USING btree ("organization_id","project_id","translation_key_id");--> statement-breakpoint
CREATE INDEX "idx_project_visual_context_bindings_screenshot" ON "project_visual_context_bindings" USING btree ("screenshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_visual_context_screenshots_object" ON "project_visual_context_screenshots" USING btree ("object_location","object_key");--> statement-breakpoint
CREATE INDEX "idx_project_visual_context_screenshots_org_project" ON "project_visual_context_screenshots" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_visual_context_screenshots_stored_file" ON "project_visual_context_screenshots" USING btree ("stored_file_id");
CREATE TABLE "project_visual_context_match_processes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"screenshot_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"repository_source_file_id" uuid,
	"translation_key_ids" uuid[],
	"override_context_older_than_days" integer,
	"checked_strings_count" integer,
	"bound_strings_count" integer,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_visual_context_match_processes_status_check" CHECK ("project_visual_context_match_processes"."status" in ('queued', 'in_progress', 'completed', 'failed')),
	CONSTRAINT "project_visual_context_match_processes_scope_check" CHECK ("project_visual_context_match_processes"."repository_source_file_id" is null or "project_visual_context_match_processes"."translation_key_ids" is null),
	CONSTRAINT "project_visual_context_match_processes_override_check" CHECK ("project_visual_context_match_processes"."override_context_older_than_days" is null or "project_visual_context_match_processes"."override_context_older_than_days" >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" DROP CONSTRAINT "project_visual_context_bindings_marker_check";--> statement-breakpoint
ALTER TABLE "project_visual_context_screenshots" DROP CONSTRAINT "project_visual_context_screenshots_stored_file_id_stored_files_id_fk";
--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD COLUMN "match_process_id" uuid;--> statement-breakpoint
ALTER TABLE "project_visual_context_match_processes" ADD CONSTRAINT "project_visual_context_match_processes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_match_processes" ADD CONSTRAINT "project_visual_context_match_processes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_match_processes" ADD CONSTRAINT "project_visual_context_match_processes_screenshot_id_project_visual_context_screenshots_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."project_visual_context_screenshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_match_processes" ADD CONSTRAINT "project_visual_context_match_processes_repository_source_file_id_repository_source_files_id_fk" FOREIGN KEY ("repository_source_file_id") REFERENCES "public"."repository_source_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_match_processes" ADD CONSTRAINT "project_visual_context_match_processes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_visual_context_match_processes_org_project" ON "project_visual_context_match_processes" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_visual_context_match_processes_active_screenshot" ON "project_visual_context_match_processes" USING btree ("screenshot_id") WHERE "project_visual_context_match_processes"."status" in ('queued', 'in_progress');--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_match_process_id_project_visual_context_match_processes_id_fk" FOREIGN KEY ("match_process_id") REFERENCES "public"."project_visual_context_match_processes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_visual_context_screenshots" ADD CONSTRAINT "project_visual_context_screenshots_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_visual_context_bindings_match_process" ON "project_visual_context_bindings" USING btree ("match_process_id");--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_source_check" CHECK ("project_visual_context_bindings"."source" in ('manual', 'auto'));--> statement-breakpoint
ALTER TABLE "project_visual_context_bindings" ADD CONSTRAINT "project_visual_context_bindings_marker_check" CHECK ((
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
        and "project_visual_context_bindings"."marker_left" + "project_visual_context_bindings"."marker_width" <= 100.000001
        and "project_visual_context_bindings"."marker_top" + "project_visual_context_bindings"."marker_height" <= 100.000001
      ));
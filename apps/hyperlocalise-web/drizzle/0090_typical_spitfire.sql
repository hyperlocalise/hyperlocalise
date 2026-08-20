ALTER TYPE "public"."interaction_source" ADD VALUE 'web_chat';--> statement-breakpoint
ALTER TYPE "public"."stored_file_source_kind" ADD VALUE 'automation_knowledge';--> statement-breakpoint
ALTER TYPE "public"."workspace_automation_run_trigger_source" ADD VALUE 'web_chat';--> statement-breakpoint
CREATE TABLE "workspace_automation_knowledge_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"stored_file_id" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"extracted_text" text DEFAULT '' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_automation_knowledge_files" ADD CONSTRAINT "workspace_automation_knowledge_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_knowledge_files" ADD CONSTRAINT "workspace_automation_knowledge_files_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_knowledge_files" ADD CONSTRAINT "workspace_automation_knowledge_files_stored_file_id_stored_files_id_fk" FOREIGN KEY ("stored_file_id") REFERENCES "public"."stored_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_knowledge_files" ADD CONSTRAINT "workspace_automation_knowledge_files_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_automation_knowledge_files_stored_file_key" ON "workspace_automation_knowledge_files" USING btree ("stored_file_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_automation_knowledge_files_automation" ON "workspace_automation_knowledge_files" USING btree ("organization_id","automation_id","created_at");
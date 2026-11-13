CREATE TABLE "workspace_automation_tool_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_automation_tool_attempts" ADD CONSTRAINT "workspace_automation_tool_attempts_run_id_workspace_automation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workspace_automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_automation_tool_attempts" ADD CONSTRAINT "workspace_automation_tool_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspace_automation_tool_attempts_call" ON "workspace_automation_tool_attempts" USING btree ("run_id","tool_call_id");
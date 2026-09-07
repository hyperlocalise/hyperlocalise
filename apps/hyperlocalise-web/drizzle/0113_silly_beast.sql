ALTER TABLE "workspace_automation_runs" ADD COLUMN "actor_kind" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_automation_runs" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_automation_runs" ADD COLUMN "actor_credential_id" text;--> statement-breakpoint
ALTER TABLE "workspace_automation_runs" ADD CONSTRAINT "workspace_automation_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
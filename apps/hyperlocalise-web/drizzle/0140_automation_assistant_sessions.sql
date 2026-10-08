ALTER TYPE "public"."interaction_source" ADD VALUE 'automation_assistant';--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "automation_id" uuid;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "assistant_turn_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_interactions_automation_author" ON "interactions" USING btree ("automation_id","created_by_user_id");
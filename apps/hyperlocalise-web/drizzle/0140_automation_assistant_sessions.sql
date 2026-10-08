CREATE TABLE "automation_assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sender_type" "message_sender_type" NOT NULL,
	"text" text NOT NULL,
	"parts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_assistant_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"automation_id" uuid,
	"title" text NOT NULL,
	"expires_at" timestamp with time zone,
	"turn_started_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_assistant_messages" ADD CONSTRAINT "automation_assistant_messages_session_id_automation_assistant_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."automation_assistant_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_assistant_sessions" ADD CONSTRAINT "automation_assistant_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_assistant_sessions" ADD CONSTRAINT "automation_assistant_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_assistant_sessions" ADD CONSTRAINT "automation_assistant_sessions_automation_id_workspace_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."workspace_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_automation_assistant_messages_session_created" ON "automation_assistant_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_automation_assistant_sessions_automation_author" ON "automation_assistant_sessions" USING btree ("automation_id","created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_automation_assistant_sessions_author_expires" ON "automation_assistant_sessions" USING btree ("created_by_user_id","expires_at");
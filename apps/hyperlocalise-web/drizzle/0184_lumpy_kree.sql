CREATE TABLE "conversation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interaction_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_message_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"snapshot_parts" jsonb,
	"agent_message_id" uuid,
	"cancel_requested_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interaction_message_tool_outputs" (
	"message_id" uuid NOT NULL,
	"tool_call_id" text NOT NULL,
	"output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interaction_message_tool_outputs_message_id_tool_call_id_pk" PRIMARY KEY("message_id","tool_call_id")
);
--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_user_message_id_interaction_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."interaction_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_agent_message_id_interaction_messages_id_fk" FOREIGN KEY ("agent_message_id") REFERENCES "public"."interaction_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_message_tool_outputs" ADD CONSTRAINT "interaction_message_tool_outputs_message_id_interaction_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."interaction_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_user_message_id_key" ON "conversation_runs" USING btree ("user_message_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_runs_interaction_created" ON "conversation_runs" USING btree ("interaction_id","created_at");
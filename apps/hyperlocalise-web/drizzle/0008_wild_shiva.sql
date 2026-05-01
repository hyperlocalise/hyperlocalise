CREATE TYPE "public"."conversation_source" AS ENUM('chat_ui', 'email_agent', 'github_agent');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'archived', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."message_sender_type" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_type" "message_sender_type" NOT NULL,
	"sender_email" text,
	"text" text NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"source" "conversation_source" NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"source_thread_id" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_translation_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."translation_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversation_messages_conversation_created" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_source_thread_id_key" ON "conversations" USING btree ("source_thread_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_org_last_message" ON "conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_source_thread" ON "conversations" USING btree ("source_thread_id");--> statement-breakpoint
ALTER TABLE "translation_jobs" ADD CONSTRAINT "translation_jobs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_translation_jobs_conversation" ON "translation_jobs" USING btree ("conversation_id");
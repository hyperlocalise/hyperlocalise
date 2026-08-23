CREATE TABLE "project_knowledge_memories" (
	"project_id" text PRIMARY KEY NOT NULL,
	"revision_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT 'Initial version' NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_knowledge_memories_content_length_check" CHECK (char_length("project_knowledge_memories"."content") <= 50000),
	CONSTRAINT "project_knowledge_memories_summary_length_check" CHECK (char_length("project_knowledge_memories"."summary") <= 160),
	CONSTRAINT "project_knowledge_memories_version_check" CHECK ("project_knowledge_memories"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "project_knowledge_memory_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"summary" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_knowledge_memory_revisions_content_length_check" CHECK (char_length("project_knowledge_memory_revisions"."content") <= 50000),
	CONSTRAINT "project_knowledge_memory_revisions_summary_length_check" CHECK (char_length("project_knowledge_memory_revisions"."summary") <= 160),
	CONSTRAINT "project_knowledge_memory_revisions_version_check" CHECK ("project_knowledge_memory_revisions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_knowledge_memories" ADD CONSTRAINT "project_knowledge_memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_memories" ADD CONSTRAINT "project_knowledge_memories_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_memory_revisions" ADD CONSTRAINT "project_knowledge_memory_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_knowledge_memory_revisions" ADD CONSTRAINT "project_knowledge_memory_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_memories_revision_id_key" ON "project_knowledge_memories" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_knowledge_memory_revisions_project_version_key" ON "project_knowledge_memory_revisions" USING btree ("project_id","version");
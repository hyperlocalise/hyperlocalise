CREATE TABLE "knowledge_memory_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"summary" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "knowledge_memory_revisions_content_length_check" CHECK (char_length("knowledge_memory_revisions"."content") <= 50000),
	CONSTRAINT "knowledge_memory_revisions_summary_length_check" CHECK (char_length("knowledge_memory_revisions"."summary") <= 160),
	CONSTRAINT "knowledge_memory_revisions_version_check" CHECK ("knowledge_memory_revisions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "knowledge_memories" ADD COLUMN "revision_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_memories" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_memories" ADD COLUMN "summary" text DEFAULT 'Initial version' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_memory_revisions" ADD CONSTRAINT "knowledge_memory_revisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_memory_revisions" ADD CONSTRAINT "knowledge_memory_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_memory_revisions_org_version_key" ON "knowledge_memory_revisions" USING btree ("organization_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_memories_revision_id_key" ON "knowledge_memories" USING btree ("revision_id");--> statement-breakpoint
ALTER TABLE "knowledge_memories" ADD CONSTRAINT "knowledge_memories_summary_length_check" CHECK (char_length("knowledge_memories"."summary") <= 160);--> statement-breakpoint
ALTER TABLE "knowledge_memories" ADD CONSTRAINT "knowledge_memories_version_check" CHECK ("knowledge_memories"."version" >= 1);
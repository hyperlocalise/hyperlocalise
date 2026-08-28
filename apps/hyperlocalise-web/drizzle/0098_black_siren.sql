CREATE TABLE "memory_entry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_entry_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"version" integer NOT NULL,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "modified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_entry_events" ADD CONSTRAINT "memory_entry_events_memory_entry_id_memory_entries_id_fk" FOREIGN KEY ("memory_entry_id") REFERENCES "public"."memory_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entry_events" ADD CONSTRAINT "memory_entry_events_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entry_events" ADD CONSTRAINT "memory_entry_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memory_entry_events_entry_occurred_at" ON "memory_entry_events" USING btree ("memory_entry_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "idx_memory_entry_events_memory_occurred_at" ON "memory_entry_events" USING btree ("memory_id","occurred_at");--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_modified_by_user_id_users_id_fk" FOREIGN KEY ("modified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_normalized_source" ON "memory_entries" USING btree ("memory_id","source_locale","normalized_source_text");
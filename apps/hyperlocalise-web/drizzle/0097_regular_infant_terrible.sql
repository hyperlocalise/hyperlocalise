ALTER TABLE "memory_entries" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "management_search_vector" "tsvector" GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce(source_text, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce(target_text, '')), 'B') ||
      setweight(to_tsvector('simple', coalesce(external_key, '')), 'A') ||
      setweight(jsonb_to_tsvector('simple', coalesce(metadata, '{}'::jsonb), '["string"]'), 'C')
    ) STORED;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD CONSTRAINT "memory_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memory_entries_management_search_vector" ON "memory_entries" USING gin ("management_search_vector");--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_created_at_id" ON "memory_entries" USING btree ("memory_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_updated_at_id" ON "memory_entries" USING btree ("memory_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_review_status" ON "memory_entries" USING btree ("memory_id","review_status");--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_provenance" ON "memory_entries" USING btree ("memory_id","provenance");--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_created_by" ON "memory_entries" USING btree ("memory_id","created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_memory_entries_memory_import_batch" ON "memory_entries" USING btree ("memory_id","import_batch_id");
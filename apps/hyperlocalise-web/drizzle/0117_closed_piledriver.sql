ALTER TABLE "glossary_concepts" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "modified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "modified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "archived_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_modified_by_user_id_users_id_fk" FOREIGN KEY ("modified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_modified_by_user_id_users_id_fk" FOREIGN KEY ("modified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_glossary_updated_at_id" ON "glossary_concepts" USING btree ("glossary_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_glossary_archived_at" ON "glossary_concepts" USING btree ("glossary_id","archived_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_created_by_user_id" ON "glossary_concepts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_reviewed_by_user_id" ON "glossary_concepts" USING btree ("reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_glossary_updated_at_id" ON "glossary_terms" USING btree ("glossary_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_review_status" ON "glossary_terms" USING btree ("glossary_id","review_status");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_provenance" ON "glossary_terms" USING btree ("glossary_id","provenance");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_created_by_user_id" ON "glossary_terms" USING btree ("glossary_id","created_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_reviewed_by_user_id" ON "glossary_terms" USING btree ("glossary_id","reviewed_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_archived_at" ON "glossary_terms" USING btree ("glossary_id","archived_at");
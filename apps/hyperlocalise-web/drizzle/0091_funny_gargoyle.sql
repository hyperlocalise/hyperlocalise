DROP INDEX "glossary_terms_glossary_external_key";--> statement-breakpoint
DROP INDEX "idx_glossary_terms_external_key";--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "external_key" text;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "external_user_id" text;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "figure" text;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "language_details" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "external_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD COLUMN "external_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "lemma" text;--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_concepts_glossary_external_key" ON "glossary_concepts" USING btree ("glossary_id","external_key");--> statement-breakpoint
ALTER TABLE "glossary_terms" DROP COLUMN "external_key";
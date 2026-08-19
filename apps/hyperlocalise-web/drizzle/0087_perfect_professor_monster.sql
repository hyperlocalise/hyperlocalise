CREATE TABLE "glossary_concepts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"glossary_id" uuid NOT NULL,
	"primary_term" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"definition" text DEFAULT '' NOT NULL,
	"translatable" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "glossary_terms_glossary_source_term_key";--> statement-breakpoint
DROP INDEX "glossary_terms_glossary_source_term_ci_key";--> statement-breakpoint
ALTER TABLE "glossaries" ALTER COLUMN "target_locale" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "concept_id" uuid;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "term_type" text;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD COLUMN "status" text DEFAULT 'preferred' NOT NULL;--> statement-breakpoint
ALTER TABLE "glossary_concepts" ADD CONSTRAINT "glossary_concepts_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_concepts_glossary_created_at" ON "glossary_concepts" USING btree ("glossary_id","created_at");--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_concept_id_glossary_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."glossary_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_glossary_source_term" ON "glossary_terms" USING btree ("glossary_id","source_term");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_glossary_source_term_ci" ON "glossary_terms" USING btree ("glossary_id",lower("source_term"));--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_terms_concept_locale_term_key" ON "glossary_terms" USING btree ("concept_id","locale","term") WHERE "glossary_terms"."concept_id" is not null and "glossary_terms"."locale" is not null and "glossary_terms"."term" is not null;--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_concept_id" ON "glossary_terms" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "idx_glossary_terms_concept_locale" ON "glossary_terms" USING btree ("concept_id","locale");
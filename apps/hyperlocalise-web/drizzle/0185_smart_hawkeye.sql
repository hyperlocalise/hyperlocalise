CREATE TABLE "translation_qa_guideline_coverage" (
	"run_id" uuid NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"target_locale" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "translation_qa_guideline_coverage" ADD CONSTRAINT "translation_qa_guideline_coverage_run_id_translation_qa_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."translation_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_qa_guideline_coverage" ADD CONSTRAINT "translation_qa_guideline_coverage_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_translation_qa_guideline_coverage_run" ON "translation_qa_guideline_coverage" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_qa_guideline_coverage_run_key_locale" ON "translation_qa_guideline_coverage" USING btree ("run_id","translation_key_id","target_locale");
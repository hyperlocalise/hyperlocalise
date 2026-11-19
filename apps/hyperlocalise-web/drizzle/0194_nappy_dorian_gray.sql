ALTER TABLE "translation_qa_findings" ADD COLUMN "passage_id" text;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD COLUMN "reasoning_available" boolean DEFAULT false NOT NULL;
ALTER TABLE "translation_qa_findings" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD COLUMN "ignore_reason" text;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD COLUMN "rule_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_qa_findings" ADD CONSTRAINT "translation_qa_findings_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
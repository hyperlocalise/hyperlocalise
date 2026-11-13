ALTER TABLE "issue_notifications" ALTER COLUMN "issue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD COLUMN "qa_run_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_qa_run_id_translation_qa_runs_id_fk" FOREIGN KEY ("qa_run_id") REFERENCES "public"."translation_qa_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_notifications_qa_run" ON "issue_notifications" USING btree ("qa_run_id");--> statement-breakpoint
ALTER TABLE "issue_notifications" ADD CONSTRAINT "issue_notifications_single_subject" CHECK (num_nonnulls("issue_notifications"."issue_id", "issue_notifications"."qa_run_id") = 1);
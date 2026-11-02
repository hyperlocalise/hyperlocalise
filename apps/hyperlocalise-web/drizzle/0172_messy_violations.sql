ALTER TABLE "reporting_rollout" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "reporting_rollout" CASCADE;--> statement-breakpoint
ALTER TABLE "reporting_analyses" DROP COLUMN "rate_id";--> statement-breakpoint
ALTER TABLE "reporting_task_rates" DROP COLUMN "rate_id";
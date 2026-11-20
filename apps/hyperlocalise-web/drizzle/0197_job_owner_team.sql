ALTER TABLE "jobs" ADD COLUMN "owner_team_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_team_id_teams_id_fk" FOREIGN KEY ("owner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_owner_team_id" ON "jobs" USING btree ("owner_team_id") WHERE "jobs"."owner_team_id" IS NOT NULL;
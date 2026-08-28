ALTER TABLE "glossaries" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "glossaries" ADD CONSTRAINT "glossaries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossaries_team_id" ON "glossaries" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "glossaries" ADD CONSTRAINT "glossaries_team_id_requires_team_control" CHECK ("glossaries"."team_id" IS NULL OR "glossaries"."control_level" = 'team');
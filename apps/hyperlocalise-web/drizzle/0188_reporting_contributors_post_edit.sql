CREATE TABLE "reporting_daily_by_person" (
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"job_id" text,
	"actor_user_id" uuid NOT NULL,
	"source_locale" text NOT NULL,
	"target_locale" text NOT NULL,
	"step" text NOT NULL,
	"bucket" text NOT NULL,
	"post_edit_bucket" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"finished_words" integer DEFAULT 0 NOT NULL,
	"finished_strings" integer DEFAULT 0 NOT NULL,
	"finished_characters" integer DEFAULT 0 NOT NULL,
	"finished_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_words" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_strings" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_characters" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_characters_with_spaces" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reporting_activity" ADD COLUMN "post_edit_score" integer;--> statement-breakpoint
ALTER TABLE "reporting_activity" ADD COLUMN "post_edit_bucket" text;--> statement-breakpoint
ALTER TABLE "reporting_rates" ADD COLUMN "pricing" text DEFAULT 'memory_match' NOT NULL;--> statement-breakpoint
ALTER TABLE "reporting_daily_by_person" ADD CONSTRAINT "reporting_daily_by_person_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_daily_by_person" ADD CONSTRAINT "reporting_daily_by_person_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reporting_daily_by_person_project" ON "reporting_daily_by_person" USING btree ("organization_id","project_id","day");--> statement-breakpoint
CREATE INDEX "reporting_daily_by_person_actor" ON "reporting_daily_by_person" USING btree ("organization_id","actor_user_id","day");--> statement-breakpoint
CREATE INDEX "reporting_daily_by_person_job" ON "reporting_daily_by_person" USING btree ("organization_id","job_id");
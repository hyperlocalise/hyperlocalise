CREATE TABLE "reporting_current_by_project" (
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"source_locale" text NOT NULL,
	"target_locale" text NOT NULL,
	"step" text NOT NULL,
	"bucket" text NOT NULL,
	"arrived_words" integer DEFAULT 0 NOT NULL,
	"arrived_strings" integer DEFAULT 0 NOT NULL,
	"arrived_characters" integer DEFAULT 0 NOT NULL,
	"arrived_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"arrived_uncounted" integer DEFAULT 0 NOT NULL,
	"arrived_done_words" integer DEFAULT 0 NOT NULL,
	"arrived_done_strings" integer DEFAULT 0 NOT NULL,
	"arrived_done_characters" integer DEFAULT 0 NOT NULL,
	"arrived_done_characters_with_spaces" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_daily_by_project" (
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"target_locale" text NOT NULL,
	"step" text NOT NULL,
	"bucket" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"source_words" integer DEFAULT 0 NOT NULL,
	"source_strings" integer DEFAULT 0 NOT NULL,
	"source_characters" integer DEFAULT 0 NOT NULL,
	"source_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"arrived_words" integer DEFAULT 0 NOT NULL,
	"arrived_strings" integer DEFAULT 0 NOT NULL,
	"arrived_characters" integer DEFAULT 0 NOT NULL,
	"arrived_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"arrived_uncounted" integer DEFAULT 0 NOT NULL,
	"arrived_done_words" integer DEFAULT 0 NOT NULL,
	"arrived_done_strings" integer DEFAULT 0 NOT NULL,
	"arrived_done_characters" integer DEFAULT 0 NOT NULL,
	"arrived_done_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_words" integer DEFAULT 0 NOT NULL,
	"finished_strings" integer DEFAULT 0 NOT NULL,
	"finished_characters" integer DEFAULT 0 NOT NULL,
	"finished_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_by_person_words" integer DEFAULT 0 NOT NULL,
	"finished_by_person_strings" integer DEFAULT 0 NOT NULL,
	"finished_by_person_characters" integer DEFAULT 0 NOT NULL,
	"finished_by_person_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_words" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_strings" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_characters" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_characters_with_spaces" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_daily_by_task" (
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"job_id" text,
	"source_locale" text NOT NULL,
	"target_locale" text NOT NULL,
	"step" text NOT NULL,
	"bucket" text NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"payable" boolean NOT NULL,
	"day" date NOT NULL,
	"source_words" integer DEFAULT 0 NOT NULL,
	"source_strings" integer DEFAULT 0 NOT NULL,
	"source_characters" integer DEFAULT 0 NOT NULL,
	"source_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"arrived_words" integer DEFAULT 0 NOT NULL,
	"arrived_strings" integer DEFAULT 0 NOT NULL,
	"arrived_characters" integer DEFAULT 0 NOT NULL,
	"arrived_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"arrived_uncounted" integer DEFAULT 0 NOT NULL,
	"arrived_done_words" integer DEFAULT 0 NOT NULL,
	"arrived_done_strings" integer DEFAULT 0 NOT NULL,
	"arrived_done_characters" integer DEFAULT 0 NOT NULL,
	"arrived_done_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_words" integer DEFAULT 0 NOT NULL,
	"finished_strings" integer DEFAULT 0 NOT NULL,
	"finished_characters" integer DEFAULT 0 NOT NULL,
	"finished_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_by_person_words" integer DEFAULT 0 NOT NULL,
	"finished_by_person_strings" integer DEFAULT 0 NOT NULL,
	"finished_by_person_characters" integer DEFAULT 0 NOT NULL,
	"finished_by_person_characters_with_spaces" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_words" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_strings" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_characters" integer DEFAULT 0 NOT NULL,
	"finished_unchanged_characters_with_spaces" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_basis" text DEFAULT 'word' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_summary_queue" (
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"day" date NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_summary_queue_organization_id_project_id_day_pk" PRIMARY KEY("organization_id","project_id","day")
);
--> statement-breakpoint
CREATE TABLE "reporting_workspaces" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary_version" integer
);
--> statement-breakpoint
ALTER TABLE "reporting_analyses" DROP CONSTRAINT "reporting_analyses_job_id_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "reporting_activity" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "reporting_activity" ADD COLUMN "unchanged" boolean;--> statement-breakpoint
ALTER TABLE "reporting_analyses" ADD COLUMN "characters" integer;--> statement-breakpoint
ALTER TABLE "reporting_analyses" ADD COLUMN "characters_with_spaces" integer;--> statement-breakpoint
ALTER TABLE "reporting_rates" ADD COLUMN "retired" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reporting_task_rates" ADD COLUMN "rate_card_name" text;--> statement-breakpoint
ALTER TABLE "reporting_task_rates" ADD COLUMN "priced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reporting_current_by_project" ADD CONSTRAINT "reporting_current_by_project_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_current_by_project" ADD CONSTRAINT "reporting_current_by_project_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_daily_by_project" ADD CONSTRAINT "reporting_daily_by_project_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_daily_by_project" ADD CONSTRAINT "reporting_daily_by_project_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_daily_by_task" ADD CONSTRAINT "reporting_daily_by_task_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_daily_by_task" ADD CONSTRAINT "reporting_daily_by_task_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_rate_cards" ADD CONSTRAINT "reporting_rate_cards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_summary_queue" ADD CONSTRAINT "reporting_summary_queue_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_workspaces" ADD CONSTRAINT "reporting_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reporting_current_by_project_project" ON "reporting_current_by_project" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "reporting_daily_by_project_project" ON "reporting_daily_by_project" USING btree ("organization_id","project_id","day");--> statement-breakpoint
CREATE INDEX "reporting_daily_by_task_project" ON "reporting_daily_by_task" USING btree ("organization_id","project_id","day");--> statement-breakpoint
CREATE INDEX "reporting_daily_by_task_job" ON "reporting_daily_by_task" USING btree ("organization_id","job_id");--> statement-breakpoint
CREATE INDEX "reporting_daily_by_task_open" ON "reporting_daily_by_task" USING btree ("organization_id","project_id","job_id") WHERE "reporting_daily_by_task"."arrived_strings" > "reporting_daily_by_task"."arrived_done_strings";--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_rate_cards_name" ON "reporting_rate_cards" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "reporting_summary_queue_marked" ON "reporting_summary_queue" USING btree ("marked_at");--> statement-breakpoint
CREATE INDEX "idx_visual_workflow_node_runs_org_finished" ON "visual_workflow_node_runs" USING btree ("organization_id","finished_at");
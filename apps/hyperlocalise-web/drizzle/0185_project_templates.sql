CREATE TABLE "project_template_glossaries" (
	"template_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_template_memories" (
	"template_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_locale" text NOT NULL,
	"target_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"project_description" text DEFAULT '' NOT NULL,
	"translation_context" text DEFAULT '' NOT NULL,
	"team_id" uuid,
	"automatically_group_identical_strings" boolean DEFAULT false NOT NULL,
	"source_text_editable" boolean DEFAULT false NOT NULL,
	"approved_translations_on_source_change" text DEFAULT 'stay_approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_templates_approved_translations_on_source_change_check" CHECK ("project_templates"."approved_translations_on_source_change" in ('stay_approved', 'needs_review'))
);
--> statement-breakpoint
ALTER TABLE "project_template_glossaries" ADD CONSTRAINT "project_template_glossaries_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_glossaries" ADD CONSTRAINT "project_template_glossaries_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_memories" ADD CONSTRAINT "project_template_memories_template_id_project_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template_memories" ADD CONSTRAINT "project_template_memories_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_glossaries_template_glossary_key" ON "project_template_glossaries" USING btree ("template_id","glossary_id");--> statement-breakpoint
CREATE INDEX "idx_project_template_glossaries_glossary_id" ON "project_template_glossaries" USING btree ("glossary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_memories_template_memory_key" ON "project_template_memories" USING btree ("template_id","memory_id");--> statement-breakpoint
CREATE INDEX "idx_project_template_memories_memory_id" ON "project_template_memories" USING btree ("memory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_templates_organization_id_name_key" ON "project_templates" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "idx_project_templates_team_id" ON "project_templates" USING btree ("team_id");
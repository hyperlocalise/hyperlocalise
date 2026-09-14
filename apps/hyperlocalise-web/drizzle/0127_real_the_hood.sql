CREATE TABLE "project_spellcheck_word_libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"library_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spellcheck_word_libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"words_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spellcheck_word_library_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"word" text NOT NULL,
	"word_normalized" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_spellcheck_word_libraries" ADD CONSTRAINT "project_spellcheck_word_libraries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_spellcheck_word_libraries" ADD CONSTRAINT "project_spellcheck_word_libraries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_spellcheck_word_libraries" ADD CONSTRAINT "project_spellcheck_word_libraries_library_id_spellcheck_word_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."spellcheck_word_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_word_libraries" ADD CONSTRAINT "spellcheck_word_libraries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_word_libraries" ADD CONSTRAINT "spellcheck_word_libraries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_word_library_words" ADD CONSTRAINT "spellcheck_word_library_words_library_id_spellcheck_word_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."spellcheck_word_libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_word_library_words" ADD CONSTRAINT "spellcheck_word_library_words_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_spellcheck_word_libraries_project_library_key" ON "project_spellcheck_word_libraries" USING btree ("project_id","library_id");--> statement-breakpoint
CREATE INDEX "idx_project_spellcheck_word_libraries_org" ON "project_spellcheck_word_libraries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_project_spellcheck_word_libraries_project_priority" ON "project_spellcheck_word_libraries" USING btree ("project_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "spellcheck_word_libraries_id_organization_id_key" ON "spellcheck_word_libraries" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_spellcheck_word_libraries_org_created_at" ON "spellcheck_word_libraries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_spellcheck_word_libraries_created_by_user_id" ON "spellcheck_word_libraries" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spellcheck_word_library_words_library_locale_word_key" ON "spellcheck_word_library_words" USING btree ("library_id","locale","word_normalized");--> statement-breakpoint
CREATE INDEX "idx_spellcheck_word_library_words_library_locale" ON "spellcheck_word_library_words" USING btree ("library_id","locale");
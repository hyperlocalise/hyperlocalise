CREATE TABLE "project_spellcheck_dictionaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spellcheck_dictionaries" (
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
CREATE TABLE "spellcheck_dictionary_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dictionary_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"word" text NOT NULL,
	"word_normalized" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_spellcheck_dictionaries" ADD CONSTRAINT "project_spellcheck_dictionaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_spellcheck_dictionaries" ADD CONSTRAINT "project_spellcheck_dictionaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_spellcheck_dictionaries" ADD CONSTRAINT "project_spellcheck_dictionaries_dictionary_id_spellcheck_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."spellcheck_dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_dictionaries" ADD CONSTRAINT "spellcheck_dictionaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_dictionaries" ADD CONSTRAINT "spellcheck_dictionaries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_dictionary_words" ADD CONSTRAINT "spellcheck_dictionary_words_dictionary_id_spellcheck_dictionaries_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."spellcheck_dictionaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spellcheck_dictionary_words" ADD CONSTRAINT "spellcheck_dictionary_words_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_spellcheck_dictionaries_project_dictionary_key" ON "project_spellcheck_dictionaries" USING btree ("project_id","dictionary_id");--> statement-breakpoint
CREATE INDEX "idx_project_spellcheck_dictionaries_org" ON "project_spellcheck_dictionaries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_project_spellcheck_dictionaries_project_priority" ON "project_spellcheck_dictionaries" USING btree ("project_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "spellcheck_dictionaries_id_organization_id_key" ON "spellcheck_dictionaries" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_spellcheck_dictionaries_org_created_at" ON "spellcheck_dictionaries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_spellcheck_dictionaries_created_by_user_id" ON "spellcheck_dictionaries" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spellcheck_dictionary_words_dictionary_locale_word_key" ON "spellcheck_dictionary_words" USING btree ("dictionary_id","locale","word_normalized");--> statement-breakpoint
CREATE INDEX "idx_spellcheck_dictionary_words_dictionary_locale" ON "spellcheck_dictionary_words" USING btree ("dictionary_id","locale");
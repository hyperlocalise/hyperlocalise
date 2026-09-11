CREATE TABLE "glossary_history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"glossary_id" uuid NOT NULL,
	"concept_id" uuid,
	"term_id" uuid,
	"event_type" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_credential_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"reason" text,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_history_events" ADD CONSTRAINT "glossary_history_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_glossary_history_events_glossary_occurred_at_id" ON "glossary_history_events" USING btree ("glossary_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "idx_glossary_history_events_concept_occurred_at" ON "glossary_history_events" USING btree ("concept_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_glossary_history_events_term_occurred_at" ON "glossary_history_events" USING btree ("term_id","occurred_at");
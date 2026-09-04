CREATE TABLE "organization_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"actor_credential_id" text,
	"event_type" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_activity_events" ADD CONSTRAINT "organization_activity_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_activity_events" ADD CONSTRAINT "organization_activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_organization_activity_events_org_created_at_id" ON "organization_activity_events" USING btree ("organization_id","created_at","id");
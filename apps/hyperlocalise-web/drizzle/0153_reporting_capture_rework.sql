CREATE TABLE "reporting_capture_cursors" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"last_event_created_at" timestamp with time zone NOT NULL,
	"last_event_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reporting_activity" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reporting_capture_cursors" ADD CONSTRAINT "reporting_capture_cursors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_activity" ADD CONSTRAINT "reporting_activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
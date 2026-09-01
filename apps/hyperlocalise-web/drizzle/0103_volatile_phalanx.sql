CREATE TABLE "slack_connect_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"slack_channel_id" text NOT NULL,
	"slack_channel_name" text NOT NULL,
	"last_invite_id" text,
	"last_invited_email" text,
	"last_invited_at" timestamp with time zone,
	"last_invited_by_user_id" uuid,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_connect_invites" ADD CONSTRAINT "slack_connect_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_connect_invites" ADD CONSTRAINT "slack_connect_invites_last_invited_by_user_id_users_id_fk" FOREIGN KEY ("last_invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_connect_invites_organization_id_key" ON "slack_connect_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_slack_connect_invites_channel_id" ON "slack_connect_invites" USING btree ("slack_channel_id");
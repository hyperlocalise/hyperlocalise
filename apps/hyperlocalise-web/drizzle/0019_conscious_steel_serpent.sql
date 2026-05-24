CREATE TABLE "slack_installation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_installation_states" ADD CONSTRAINT "slack_installation_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installation_states" ADD CONSTRAINT "slack_installation_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installation_states_nonce_key" ON "slack_installation_states" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "idx_slack_installation_states_org_user" ON "slack_installation_states" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_slack_installation_states_expires_at" ON "slack_installation_states" USING btree ("expires_at");
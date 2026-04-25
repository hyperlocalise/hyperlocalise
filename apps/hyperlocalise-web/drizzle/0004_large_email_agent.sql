ALTER TABLE "organizations" ADD COLUMN "email_agent_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "inbound_email_alias" text;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_inbound_email_alias_key" ON "organizations" USING btree ("inbound_email_alias");

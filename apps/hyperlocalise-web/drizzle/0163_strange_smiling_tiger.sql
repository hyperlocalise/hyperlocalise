CREATE TABLE "customer_io_connection_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workos_user_id" text NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_io_connection_settings" ADD CONSTRAINT "customer_io_connection_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_io_connection_settings_org_user_key" ON "customer_io_connection_settings" USING btree ("organization_id","workos_user_id");--> statement-breakpoint
CREATE INDEX "idx_customer_io_connection_settings_org" ON "customer_io_connection_settings" USING btree ("organization_id");
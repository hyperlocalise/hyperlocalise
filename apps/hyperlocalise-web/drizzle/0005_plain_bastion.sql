CREATE TABLE "mcp_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"allowed_redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ALTER COLUMN "organization_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "mcp_clients" ADD CONSTRAINT "mcp_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_clients_client_id_key" ON "mcp_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_clients_org" ON "mcp_clients" USING btree ("organization_id");
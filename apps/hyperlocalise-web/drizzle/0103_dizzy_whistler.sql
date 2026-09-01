CREATE TABLE "canva_connection_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_token_hash" text NOT NULL,
	"organization_id" uuid,
	"connection_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"encryption_algorithm" text,
	"ciphertext" text,
	"iv" text,
	"auth_tag" text,
	"key_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canva_connection_claims" ADD CONSTRAINT "canva_connection_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_connection_claims" ADD CONSTRAINT "canva_connection_claims_connection_id_canva_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."canva_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canva_connection_claims_poll_token_hash_key" ON "canva_connection_claims" USING btree ("poll_token_hash");--> statement-breakpoint
CREATE INDEX "idx_canva_connection_claims_org" ON "canva_connection_claims" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_canva_connection_claims_expires" ON "canva_connection_claims" USING btree ("expires_at");
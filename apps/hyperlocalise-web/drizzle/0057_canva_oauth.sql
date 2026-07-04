DROP TABLE IF EXISTS "canva_connections";--> statement-breakpoint
CREATE TABLE "canva_oauth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text DEFAULT 'canva.localize offline_access' NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"canva_brand_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canva_brand_org_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canva_brand_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"bound_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canva_oauth_sessions" ADD CONSTRAINT "canva_oauth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_brand_org_bindings" ADD CONSTRAINT "canva_brand_org_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_brand_org_bindings" ADD CONSTRAINT "canva_brand_org_bindings_bound_by_user_id_users_id_fk" FOREIGN KEY ("bound_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canva_oauth_sessions_access_token_hash_key" ON "canva_oauth_sessions" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "canva_oauth_sessions_refresh_token_hash_key" ON "canva_oauth_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "idx_canva_oauth_sessions_user_id" ON "canva_oauth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_canva_oauth_sessions_expires_at" ON "canva_oauth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "canva_brand_org_bindings_brand_key" ON "canva_brand_org_bindings" USING btree ("canva_brand_id");--> statement-breakpoint
CREATE INDEX "idx_canva_brand_org_bindings_org" ON "canva_brand_org_bindings" USING btree ("organization_id");

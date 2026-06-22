CREATE TABLE "canva_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"display_name" text NOT NULL,
	"source_locale" text DEFAULT 'en' NOT NULL,
	"target_locales" jsonb DEFAULT '["es","fr","de"]'::jsonb NOT NULL,
	"canva_brand_id" text,
	"connection_token_hash" text NOT NULL,
	"connection_token_prefix" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_api_key_id_organization_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."organization_api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canva_connections_token_hash_key" ON "canva_connections" USING btree ("connection_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "canva_connections_org_brand_key" ON "canva_connections" USING btree ("organization_id","canva_brand_id") WHERE "canva_connections"."canva_brand_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_canva_connections_org" ON "canva_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_canva_connections_api_key" ON "canva_connections" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "idx_canva_connections_project" ON "canva_connections" USING btree ("project_id");
CREATE TABLE "organization_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"permissions" jsonb DEFAULT '["jobs:read", "jobs:write"]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_api_keys" ADD CONSTRAINT "organization_api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_api_keys" ADD CONSTRAINT "organization_api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_api_keys_key_hash_key" ON "organization_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_organization_api_keys_org" ON "organization_api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_organization_api_keys_created_at" ON "organization_api_keys" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_api_key_id_organization_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."organization_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_jobs_api_key_id" ON "jobs" USING btree ("api_key_id");

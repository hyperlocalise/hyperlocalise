CREATE TABLE "gitlab_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"display_name" text NOT NULL,
	"base_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"validation_status" text DEFAULT 'unvalidated' NOT NULL,
	"validation_message" text,
	"last_validated_at" timestamp with time zone,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"masked_access_token_suffix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD CONSTRAINT "gitlab_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD CONSTRAINT "gitlab_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD CONSTRAINT "gitlab_connections_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_gitlab_connections_org" ON "gitlab_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gitlab_connections_org_base_url" ON "gitlab_connections" USING btree ("organization_id","base_url");
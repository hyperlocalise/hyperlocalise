CREATE TABLE "gitlab_connection_states" (
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
CREATE TABLE "gitlab_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"base_url" text DEFAULT 'https://gitlab.com' NOT NULL,
	"gitlab_user_id" bigint NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"oauth_expires_at" timestamp with time zone,
	"encryption_algorithm" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gitlab_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"gitlab_connection_id" uuid NOT NULL,
	"gitlab_project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"path_with_namespace" text NOT NULL,
	"http_url_to_repo" text NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"default_branch" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gitlab_connection_states" ADD CONSTRAINT "gitlab_connection_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_connection_states" ADD CONSTRAINT "gitlab_connection_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD CONSTRAINT "gitlab_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_projects" ADD CONSTRAINT "gitlab_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gitlab_projects" ADD CONSTRAINT "gitlab_projects_gitlab_connection_id_gitlab_connections_id_fk" FOREIGN KEY ("gitlab_connection_id") REFERENCES "public"."gitlab_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gitlab_connection_states_nonce_key" ON "gitlab_connection_states" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "idx_gitlab_connection_states_org_user" ON "gitlab_connection_states" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_gitlab_connection_states_expires_at" ON "gitlab_connection_states" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gitlab_connections_organization_id_key" ON "gitlab_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gitlab_connections_base_url_gitlab_user_id_key" ON "gitlab_connections" USING btree ("base_url","gitlab_user_id");--> statement-breakpoint
CREATE INDEX "idx_gitlab_connections_created_at" ON "gitlab_connections" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gitlab_projects_connection_project_id_key" ON "gitlab_projects" USING btree ("gitlab_connection_id","gitlab_project_id");--> statement-breakpoint
CREATE INDEX "idx_gitlab_projects_org" ON "gitlab_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_gitlab_projects_connection" ON "gitlab_projects" USING btree ("gitlab_connection_id");--> statement-breakpoint
CREATE INDEX "idx_gitlab_projects_org_enabled" ON "gitlab_projects" USING btree ("organization_id","enabled");
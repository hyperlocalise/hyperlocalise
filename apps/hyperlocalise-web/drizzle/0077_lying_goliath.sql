CREATE TABLE "interaction_repository_sessions" (
	"interaction_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"session" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interaction_repository_sessions" ADD CONSTRAINT "interaction_repository_sessions_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_repository_sessions" ADD CONSTRAINT "interaction_repository_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_interaction_repository_sessions_org_expires" ON "interaction_repository_sessions" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_interaction_repository_sessions_expires" ON "interaction_repository_sessions" USING btree ("expires_at");
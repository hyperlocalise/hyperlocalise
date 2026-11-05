DROP INDEX "gitlab_connections_organization_key";--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "gitlab_connections" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_gitlab_connections_org" ON "gitlab_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gitlab_connections_default_key" ON "gitlab_connections" USING btree ("organization_id") WHERE "gitlab_connections"."is_default";
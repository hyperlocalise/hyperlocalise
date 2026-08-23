DROP INDEX "projects_identifier_key";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_organization_id_identifier_key" ON "projects" USING btree ("organization_id","identifier");
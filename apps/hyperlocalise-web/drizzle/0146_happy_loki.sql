ALTER TABLE "canva_connections" DROP CONSTRAINT "canva_connections_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "canva_connections" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
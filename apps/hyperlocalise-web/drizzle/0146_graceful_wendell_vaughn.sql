ALTER TABLE "canva_connections" DROP CONSTRAINT "canva_connections_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "canva_connections" ADD CONSTRAINT "canva_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
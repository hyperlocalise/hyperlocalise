CREATE TABLE "guideline_document_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_guideline_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guideline_document_projects" ADD CONSTRAINT "guideline_document_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_document_projects" ADD CONSTRAINT "guideline_document_projects_document_id_guideline_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."guideline_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_document_projects" ADD CONSTRAINT "guideline_document_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_guideline_projects" ADD CONSTRAINT "workspace_guideline_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_guideline_projects" ADD CONSTRAINT "workspace_guideline_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guideline_document_projects_document_project_key" ON "guideline_document_projects" USING btree ("document_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_guideline_document_projects_org" ON "guideline_document_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_guideline_document_projects_project" ON "guideline_document_projects" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_guideline_projects_org_project_key" ON "workspace_guideline_projects" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_guideline_projects_org" ON "workspace_guideline_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_guideline_projects_project" ON "workspace_guideline_projects" USING btree ("project_id");
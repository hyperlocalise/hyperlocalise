CREATE TABLE "issue_sheet_routing_failures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"issue_id" uuid NOT NULL,
	"recipe_id" uuid,
	"error_code" text NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_sheet_routing_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_sheet_routing_failures" ADD CONSTRAINT "issue_sheet_routing_failures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_routing_failures" ADD CONSTRAINT "issue_sheet_routing_failures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_routing_failures" ADD CONSTRAINT "issue_sheet_routing_failures_issue_id_issue_sheet_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue_sheet_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_routing_failures" ADD CONSTRAINT "issue_sheet_routing_failures_recipe_id_issue_sheet_routing_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."issue_sheet_routing_recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_routing_recipes" ADD CONSTRAINT "issue_sheet_routing_recipes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_sheet_routing_recipes" ADD CONSTRAINT "issue_sheet_routing_recipes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_routing_failures_project_created" ON "issue_sheet_routing_failures" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_routing_failures_issue" ON "issue_sheet_routing_failures" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_routing_recipes_project_order" ON "issue_sheet_routing_recipes" USING btree ("project_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_routing_recipes_org_project" ON "issue_sheet_routing_recipes" USING btree ("organization_id","project_id");
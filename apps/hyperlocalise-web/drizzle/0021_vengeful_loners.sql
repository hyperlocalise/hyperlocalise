CREATE TYPE "public"."tms_agent_automation_scope" AS ENUM('organization', 'project', 'provider');--> statement-breakpoint
CREATE TABLE "tms_agent_automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"scope" "tms_agent_automation_scope" NOT NULL,
	"project_id" text,
	"provider_credential_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tms_agent_automation_settings_org_scope_key" UNIQUE NULLS NOT DISTINCT("organization_id","scope","project_id","provider_credential_id"),
	CONSTRAINT "tms_agent_automation_settings_scope_shape" CHECK ((
        ("tms_agent_automation_settings"."scope" = 'organization' AND "tms_agent_automation_settings"."project_id" IS NULL AND "tms_agent_automation_settings"."provider_credential_id" IS NULL)
        OR ("tms_agent_automation_settings"."scope" = 'project' AND "tms_agent_automation_settings"."project_id" IS NOT NULL AND "tms_agent_automation_settings"."provider_credential_id" IS NULL)
        OR ("tms_agent_automation_settings"."scope" = 'provider' AND "tms_agent_automation_settings"."project_id" IS NULL AND "tms_agent_automation_settings"."provider_credential_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "tms_agent_automation_settings" ADD CONSTRAINT "tms_agent_automation_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tms_agent_automation_settings" ADD CONSTRAINT "tms_agent_automation_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tms_agent_automation_settings" ADD CONSTRAINT "tms_agent_automation_settings_provider_credential_id_organization_external_tms_provider_credentials_id_fk" FOREIGN KEY ("provider_credential_id") REFERENCES "public"."organization_external_tms_provider_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tms_agent_automation_settings_org" ON "tms_agent_automation_settings" USING btree ("organization_id");
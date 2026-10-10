CREATE TABLE "guideline_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text,
	"locale" text,
	"title" text NOT NULL,
	"storage_location_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"revision_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_code" text,
	"indexed_revision_id" uuid,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guideline_documents_content_length_check" CHECK (char_length("guideline_documents"."content") <= 50000),
	CONSTRAINT "guideline_documents_title_length_check" CHECK (char_length("guideline_documents"."title") <= 200),
	CONSTRAINT "guideline_documents_status_check" CHECK ("guideline_documents"."status" in ('processing', 'ready', 'failed')),
	CONSTRAINT "guideline_documents_version_check" CHECK ("guideline_documents"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "guideline_documents" ADD CONSTRAINT "guideline_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_documents" ADD CONSTRAINT "guideline_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guideline_documents" ADD CONSTRAINT "guideline_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_guideline_documents_org_project" ON "guideline_documents" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_guideline_documents_status_enqueued_at" ON "guideline_documents" USING btree ("status","enqueued_at");
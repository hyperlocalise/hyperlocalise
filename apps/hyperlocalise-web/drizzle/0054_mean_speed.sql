CREATE TYPE "public"."project_translation_comment_type" AS ENUM('comment', 'issue');--> statement-breakpoint
CREATE TABLE "project_translation_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" text NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"target_locale" text NOT NULL,
	"type" "project_translation_comment_type" DEFAULT 'comment' NOT NULL,
	"status" text,
	"text" text NOT NULL,
	"issue_type" text,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_translation_comments" ADD CONSTRAINT "project_translation_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_comments" ADD CONSTRAINT "project_translation_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_comments" ADD CONSTRAINT "project_translation_comments_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_translation_comments" ADD CONSTRAINT "project_translation_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_translation_comments_org_project" ON "project_translation_comments" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_translation_comments_key_locale" ON "project_translation_comments" USING btree ("translation_key_id","target_locale");
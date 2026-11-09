ALTER TYPE "public"."translation_job_type" ADD VALUE 'keys';--> statement-breakpoint
CREATE TABLE "translation_job_keys" (
	"job_id" text NOT NULL,
	"translation_key_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_job_keys_job_id_translation_key_id_pk" PRIMARY KEY("job_id","translation_key_id")
);
--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "project_translation_keys" ADD COLUMN "design_url" text;--> statement-breakpoint
ALTER TABLE "translation_job_keys" ADD CONSTRAINT "translation_job_keys_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_job_keys" ADD CONSTRAINT "translation_job_keys_translation_key_id_project_translation_keys_id_fk" FOREIGN KEY ("translation_key_id") REFERENCES "public"."project_translation_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_translation_job_keys_translation_key" ON "translation_job_keys" USING btree ("translation_key_id");--> statement-breakpoint
CREATE INDEX "idx_project_translation_keys_tags" ON "project_translation_keys" USING gin ("tags");
ALTER TABLE "guideline_documents" ADD COLUMN "locales" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "guideline_documents" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;
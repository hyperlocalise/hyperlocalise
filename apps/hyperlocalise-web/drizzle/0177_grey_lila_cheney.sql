CREATE TYPE "public"."project_translation_origin" AS ENUM('machine', 'machine_post_edited', 'human', 'unknown');--> statement-breakpoint
ALTER TABLE "project_translation_revisions" ADD COLUMN "origin" "project_translation_origin" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_translations" ADD COLUMN "origin" "project_translation_origin" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_project_translations_origin" ON "project_translations" USING btree ("project_id","origin");--> statement-breakpoint
-- Backfill origin from provenance and history. A person's save (provenance 'manual') is compared
-- with the latest earlier write that was not a person's: the same text keeps that write's origin,
-- changed text over machine text is post-edited, anything else is the person's own.
UPDATE "project_translation_revisions" AS r
SET "origin" = (CASE
	WHEN r."provenance" IN ('translation_job', 'agent') THEN 'machine'
	WHEN r."provenance" = 'import' THEN 'unknown'
	WHEN g."provenance" IS NULL THEN 'human'
	WHEN g."provenance" IN ('translation_job', 'agent') AND g."text" = r."text" THEN 'machine'
	WHEN g."provenance" IN ('translation_job', 'agent') THEN 'machine_post_edited'
	WHEN g."text" = r."text" THEN 'unknown'
	ELSE 'human'
END)::"project_translation_origin"
FROM "project_translation_revisions" AS r2
LEFT JOIN LATERAL (
	SELECT p."provenance", p."text" FROM "project_translation_revisions" AS p
	WHERE p."translation_id" = r2."translation_id" AND p."provenance" <> 'manual'
		AND (p."created_at", p."id") < (r2."created_at", r2."id")
	ORDER BY p."created_at" DESC, p."id" DESC LIMIT 1
) AS g ON true
WHERE r2."id" = r."id";--> statement-breakpoint
UPDATE "project_translations" AS t
SET "origin" = (CASE
	WHEN t."provenance" IN ('translation_job', 'agent') THEN 'machine'
	WHEN t."provenance" = 'import' THEN 'unknown'
	WHEN g."provenance" IS NULL THEN 'human'
	WHEN g."provenance" IN ('translation_job', 'agent') AND g."text" = t."text" THEN 'machine'
	WHEN g."provenance" IN ('translation_job', 'agent') THEN 'machine_post_edited'
	WHEN g."text" = t."text" THEN 'unknown'
	ELSE 'human'
END)::"project_translation_origin"
FROM "project_translations" AS t2
LEFT JOIN LATERAL (
	SELECT p."provenance", p."text" FROM "project_translation_revisions" AS p
	WHERE p."translation_id" = t2."id" AND p."provenance" <> 'manual'
	ORDER BY p."created_at" DESC, p."id" DESC LIMIT 1
) AS g ON true
WHERE t2."id" = t."id";

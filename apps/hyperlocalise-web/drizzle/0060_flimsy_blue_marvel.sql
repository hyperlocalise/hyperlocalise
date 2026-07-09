ALTER TABLE "repository_source_file_versions" ADD COLUMN "version_sequence" integer;--> statement-breakpoint
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY repository_source_file_id
      ORDER BY created_at, id
    ) AS seq
  FROM "repository_source_file_versions"
)
UPDATE "repository_source_file_versions" AS v
SET "version_sequence" = ranked.seq
FROM ranked
WHERE v.id = ranked.id;--> statement-breakpoint
ALTER TABLE "repository_source_file_versions" ALTER COLUMN "version_sequence" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_source_file_versions_file_sequence_key" ON "repository_source_file_versions" USING btree ("repository_source_file_id","version_sequence");

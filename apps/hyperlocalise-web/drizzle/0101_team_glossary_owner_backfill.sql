UPDATE "glossaries" AS g
SET "team_id" = picked."team_id"
FROM (
    SELECT DISTINCT ON (pg."glossary_id")
        pg."glossary_id",
        p."team_id"
    FROM "project_glossaries" pg
    INNER JOIN "projects" p ON p."id" = pg."project_id"
    WHERE p."team_id" IS NOT NULL
        AND p."source" = 'native'
    ORDER BY pg."glossary_id", pg."priority", pg."project_id"
) AS picked
WHERE g."id" = picked."glossary_id"
    AND g."control_level" = 'team'
    AND g."team_id" IS NULL;--> statement-breakpoint
ALTER TABLE "glossaries" ADD CONSTRAINT "glossaries_team_control_requires_team_id" CHECK ("glossaries"."control_level" <> 'team' OR "glossaries"."team_id" IS NOT NULL);

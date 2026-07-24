ALTER TABLE "projects" ADD COLUMN "identifier" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "issue_number_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD COLUMN "identifier" text;--> statement-breakpoint
DO $$
DECLARE
  project_row RECORD;
  candidate text;
  initials text;
  letters text;
  next_identifier text;
  suffix integer;
  base_max integer;
  base text;
BEGIN
  FOR project_row IN
    SELECT id, organization_id, name
    FROM projects
    ORDER BY created_at ASC, id ASC
  LOOP
    initials := upper(regexp_replace(
      coalesce((
        SELECT string_agg(left(word, 1), '')
        FROM (
          SELECT regexp_replace(part, '[^A-Za-z0-9]', '', 'g') AS word
          FROM unnest(regexp_split_to_array(trim(project_row.name), '[\s/_-]+')) AS part
        ) words
        WHERE word <> ''
      ), ''),
      '[^A-Z0-9]',
      '',
      'g'
    ));

    candidate := initials;
    IF length(candidate) < 2 THEN
      letters := left(upper(regexp_replace(project_row.name, '[^A-Za-z0-9]', '', 'g')), 3);
      IF length(letters) >= 2 THEN
        candidate := letters;
      ELSE
        candidate := 'PROJ';
      END IF;
    END IF;

    candidate := left(candidate, 10);
    IF candidate !~ '^[A-Z]' THEN
      candidate := left('P' || candidate, 10);
    END IF;
    IF candidate !~ '^[A-Z][A-Z0-9]{0,9}$' THEN
      candidate := 'PROJ';
    END IF;

    next_identifier := candidate;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1
      FROM projects
      WHERE organization_id = project_row.organization_id
        AND identifier = next_identifier
    ) LOOP
      base_max := 10 - length(suffix::text);
      IF base_max < 1 THEN
        next_identifier := left('PROJ' || suffix::text, 10);
      ELSE
        base := left(candidate, base_max);
        IF base !~ '^[A-Z]' THEN
          base := 'P';
        END IF;
        next_identifier := left(base || suffix::text, 10);
      END IF;
      suffix := suffix + 1;
      IF suffix > 10000 THEN
        RAISE EXCEPTION 'project identifier backfill exhausted for %', project_row.id;
      END IF;
    END LOOP;

    UPDATE projects
    SET identifier = next_identifier
    WHERE id = project_row.id;
  END LOOP;
END $$;--> statement-breakpoint
WITH numbered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY project_id
      ORDER BY created_at ASC, id ASC
    ) AS issue_number
  FROM issue_sheet_issues
)
UPDATE issue_sheet_issues AS issues
SET number = numbered.issue_number
FROM numbered
WHERE issues.id = numbered.id;--> statement-breakpoint
UPDATE issue_sheet_issues AS issues
SET identifier = projects.identifier || '-' || issues.number::text
FROM projects
WHERE projects.id = issues.project_id;--> statement-breakpoint
UPDATE projects AS project_rows
SET issue_number_seq = coalesce(issue_counts.max_number, 0)
FROM (
  SELECT project_id, max(number) AS max_number
  FROM issue_sheet_issues
  GROUP BY project_id
) AS issue_counts
WHERE project_rows.id = issue_counts.project_id;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "identifier" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ALTER COLUMN "identifier" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_identifier_key" ON "projects" USING btree ("organization_id","identifier");--> statement-breakpoint
CREATE INDEX "idx_issue_sheet_issues_org_project_number" ON "issue_sheet_issues" USING btree ("organization_id","project_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_issues_project_number_key" ON "issue_sheet_issues" USING btree ("project_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_sheet_issues_project_identifier_key" ON "issue_sheet_issues" USING btree ("project_id","identifier");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_identifier_format_check" CHECK ("projects"."identifier" ~ '^[A-Z][A-Z0-9]{0,9}$');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_issue_number_seq_check" CHECK ("projects"."issue_number_seq" >= 0);--> statement-breakpoint
ALTER TABLE "issue_sheet_issues" ADD CONSTRAINT "issue_sheet_issues_number_check" CHECK ("issue_sheet_issues"."number" >= 1);

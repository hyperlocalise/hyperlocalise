# Guideline document project assignment design

**Status:** Accepted

## Context

Guidelines are `guideline_documents` records: org-wide (`project_id IS NULL`)
or project-owned. Retrieval, checks, translation context, and agent recall
resolve the documents in scope for a project. Org-wide documents need an
explicit rule for which projects they apply to, recorded in
`guideline_document_projects`. The previous rule treated an empty assignment
as "applies to every project", so every upload silently affected all projects.

## Decision

An org-wide guideline document applies to a project only when
`guideline_document_projects` lists it. An unassigned org-wide document
applies to no project. Project-owned documents always apply to their own
project and skip assignment. Org-level scopes with no project keep all
org-scoped content.

Enforcement lives in the two retrieval queries so every consumer inherits
it: `currentQuery` in `internal/guidelines/postgres/source.go` and
`mergeQuery` in `apps/go-svc/guideline-retrieve.go`. Both keep the
`$project = ''` arm for org-level checks and drop the `NOT EXISTS` arm that
included unassigned documents in project scopes.

The document detail page carries a **Projects** section where admins and
localization managers assign or remove projects. The Content Editor workspace
tab and every project-scoped retrieval surface only assigned documents.

## Validation

Update `TestCurrentRespectsProjectAssignment` to assert an unassigned
org-wide document is excluded from project scopes, and
`TestCurrentReturnsScopedGuidelinesInOrder` to assign the org-wide document
before expecting it in project scope. Update the Content Editor sheet test
to assert unassigned workspace documents are hidden. `go vet` the touched
packages; `vp check` and `vp test` the touched web suites.

## Alternatives considered

- **Empty assignment means every project:** the old default. Rejected because
  uploads silently leak into unrelated projects, and the fix (remembering to
  restrict each upload) fails open.
- **Auto-assign new uploads to all current projects:** preserves old behavior
  for existing projects but still surprises on new projects, and diverges from
  the explicit per-document model on the detail page.

## Non-goals

Backfilling assignments for existing documents, per-locale assignment,
assignment audit history, and role changes to who can assign.

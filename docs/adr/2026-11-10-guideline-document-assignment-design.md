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

An org-wide guideline document with no `guideline_document_projects` rows
applies to every project (global). This keeps setup-wizard guidance visible
to all current and future projects without per-project writes. Once
assignment rows exist for a document, it applies only to listed projects.
Project-owned documents always apply to their own project and skip
assignment. Org-level scopes with no project keep all org-scoped content.

Enforcement lives in the two retrieval queries so every consumer inherits
it: `currentQuery` in `internal/guidelines/postgres/source.go` and
`mergeQuery` in `apps/go-svc/guideline-retrieve.go`. Both keep the
`$project = ''` arm for org-level checks and add a `NOT EXISTS` arm that
includes unassigned org-wide documents in project scopes.

The document detail page carries a **Projects** section where admins and
localization managers assign or remove projects. Assigning a first project
scopes a previously global document to listed projects only. The Content
Editor workspace tab and every project-scoped retrieval surface global
documents plus documents assigned to that project.

## Validation

Update `TestCurrentRespectsProjectAssignment` to assert an unassigned
org-wide document is visible in every project scope, and that assigning it
to one project hides it from siblings. Update
`TestCurrentReturnsScopedGuidelinesInOrder` to cover both a global
unassigned document and an assigned scoped document. Update the Content
Editor sheet test to assert unassigned workspace documents are shown.
`go vet` the touched packages; `vp check` and `vp test` the touched web suites.

## Cutover from typed notes

Typed workspace/project notes (`knowledge_memories`,
`project_knowledge_memories`) are retired without a backfill: translation
context, checks, MCP `get_knowledge_memory`, and the Knowledge page read
`guideline_documents` only, and the legacy routes return 410
`knowledge_memory_gone`. Existing typed rows stay in the database unread.
This is an accepted breaking change; operators should re-enter any live
guidance as a guideline document before upgrading.

## Alternatives considered

- **Empty assignment means every project:** adopted. Setup-wizard guidance
  and other org-wide defaults stay visible to all current and future
  projects without per-project writes; scoping a document is an explicit
  assign-first-project action on the detail page.
- **Auto-assign new uploads to all current projects:** preserves old behavior
  for existing projects but still surprises on new projects, and diverges from
  the explicit per-document model on the detail page.

## Non-goals

Backfilling assignments for existing documents, per-locale assignment,
assignment audit history, and role changes to who can assign.

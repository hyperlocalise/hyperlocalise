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

An org-wide guideline (`project_id` NULL) applies to every project only when
`is_global` is true. `is_global` false with no assignment rows applies to no
project, which is the upload default. Assignment rows list the projects a
non-global document applies to. The setup wizard sets `is_global` true when
it creates "Setup wizard guidance". A later wizard run does not change that
flag on the existing document.

A stored `project_id` is not copied into `guideline_document_projects` and
is not cleared. Reads treat it as applying only to that project. A stored
`locale` is not copied into `locales`. A non-empty `locales` array is the
only locale match. An empty array with a NULL `locale` means all locales.
An empty array with `locale` set means that locale only. There is no
backfill.

Enforcement lives in `currentQuery` in
`internal/guidelines/postgres/source.go`, `mergeQuery` in
`apps/go-svc/guideline-retrieve.go`, and the document list filter. An empty
project scope keeps org rows for org-level checks. An empty locale keeps
only all-locale rows.

The document detail page carries a **Projects** section where admins and
localization managers assign or remove projects. The Content Editor project
and workspace tabs both list documents in scope for the open project:
global documents plus documents assigned to that project.

## Validation

`TestCurrentRespectsProjectAssignment` covers global documents and
assignment. `TestCurrentHonorsLegacyLocaleAndProject` covers a stored
`project_id` and a stored `locale` without rewriting the row. The setup
wizard test expects `isGlobal: true` only on create.

## Cutover from typed notes

Typed workspace/project notes (`knowledge_memories`,
`project_knowledge_memories`) are retired without a backfill: translation
context, checks, MCP `get_knowledge_memory`, and the Knowledge page read
`guideline_documents` only, and the legacy routes return 410
`knowledge_memory_gone`. Existing typed rows stay in the database unread.
This is an accepted breaking change; operators should re-enter any live
guidance as a guideline document before upgrading.

## Alternatives considered

- **Empty assignment means every project:** rejected. New uploads would
  apply to every project until someone assigned one. `is_global` records
  that choice explicitly. The setup wizard opts in when it creates guidance.
- **Backfill existing rows:** rejected. Reads honor a stored `project_id`
  and `locale`. Columns are not rewritten.
- **Auto-assign new uploads to all current projects:** preserves old behavior
  for existing projects but still surprises on new projects, and diverges from
  the explicit per-document model on the detail page.

## Non-goals

Backfilling assignments for existing documents, per-locale assignment,
assignment audit history, and role changes to who can assign.

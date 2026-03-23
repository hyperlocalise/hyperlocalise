# Translation project CRUD design

## Context

The translation service already accepted `project_id` on jobs, file uploads, and translation files, but that value was only a string carried through request validation and storage queries.

That left two gaps:

- there was no first-class project resource to create, inspect, update, or delete
- jobs and files could be written against any arbitrary `project_id`, so project ownership was implied rather than enforced

The product requirement is to separate translation work by project and require the project to exist before translation jobs or file workflows can be created.

## Decision

The translation service will own a first-class `Project` resource and expose CRUD for it from the existing `hyperlocalise.translation.v1.TranslationService`.

Projects are the strict parent resource for:

- translation jobs
- translation file uploads
- translation files

Project identifiers are server-generated. Clients create a project by supplying a name and optional description, then use the returned `project_id` for all child translation operations.

## Data model

A new `translation_projects` table will store:

- `id`
- `name`
- `description`
- `created_at`
- `updated_at`

Existing child tables will gain foreign keys to `translation_projects(id)`:

- `translation_jobs.project_id`
- `translation_file_uploads.project_id`
- `translation_files.project_id`

The foreign keys will use `ON DELETE CASCADE` so a project hard-delete removes all owned translation resources. `translation_file_variants` remains attached through `file_id` and is already cascade-deleted from `translation_files`.

## API shape

The gRPC API will add:

- `CreateProject`
- `GetProject`
- `ListProjects`
- `UpdateProject`
- `DeleteProject`

The `Project` message will contain:

- `id`
- `name`
- optional `description`
- `created_at`
- `updated_at`

Existing job and file methods will keep their current `project_id` fields. They will now validate that the referenced project exists before writing child records.

## Migration strategy

The migration will:

1. create `translation_projects`
2. backfill rows for any distinct legacy `project_id` values already present in jobs, uploads, or files
3. assign generated placeholder metadata for backfilled rows
4. add foreign keys after the backfill completes

This preserves existing data while tightening ownership guarantees for new requests.

## Consequences

- translation work is now explicitly grouped and lifecycle-managed through projects
- invalid or mistyped `project_id` values fail early with `NotFound`
- deleting a project removes its jobs and file catalog entries in one operation
- the existing service boundary remains intact, avoiding a second service just for project management

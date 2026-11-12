# Native project version branches

**Status:** Accepted

## Context

Native Hyperlocalise projects had no version line of work. Files and strings lived in one unnamed space. Connected TMS projects already expose a branch picker on Files: Phrase Strings copies keys onto a named branch, Crowdin duplicates a folder tree, and Smartling only monitors a Git branch.

Teams need to translate a release without blocking `main`, then merge the finished strings back. Git-connector monitoring is not enough: native uploads, CAT, and jobs never leave the database.

## Decision

Add Phrase Strings-style version branches to native projects:

- Metadata in `project_branches` (`main` is created with the project).
- Files and keys carry `branch_name` (default `main`).
- Create clones files, latest versions, keys, and translations. Versions share stored blobs.
- Sync copies the parent into the branch. Merge copies added and changed keys; `use_branch` also takes source-text conflicts. Deletes stay out of v1.
- Protected branches reject uploads. `main` is not protected by default.
- Jobs, comments, and activity stay on the branch and are not copied on merge.
- The Files picker lists native branches and has no "All branches" option. Empty native `branch` query params resolve to `main`.

Connected TMS projects keep their provider pickers. Smartling still has no TMS-level branches.

## Alternatives

A required `branch_id` foreign key would break existing unique indexes and every file insert. A Git-only model would leave dashboard uploads and CAT unscoped. Crowdin-style duplicate hiding is extra product work, not required to ship a named copy of strings.

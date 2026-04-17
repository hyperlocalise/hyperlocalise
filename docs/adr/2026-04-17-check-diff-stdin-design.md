# Diff-scoped check mode for changed keys

## Summary

Add `hyperlocalise check --diff-stdin` to read a unified git patch from stdin, extract changed translation keys for configured key-value files, and run key-scoped validation only for those keys.

Supported diff-scoped file types in this change:

- `.json`
- `.jsonc`
- `.arb`

Excluded from this change:

- `.yaml`
- `.yml`
- non-entry-based formats such as markdown, HTML, CSV, XLIFF, PO, and Apple strings variants

## Goals

- Keep normal `check` behavior unchanged
- Support source-file and target-file patches
- Scope findings by source file, target locale, and changed key
- Allow `--key` to further intersect the diff-derived key set
- Skip checks that do not make sense without a full-file scan

## Design

### Selection model

Replace the single `keyFilter` string with a selection model that can express:

- unrestricted scans
- a global `--key` filter
- per-source-file changed-key sets from diff input
- locale restrictions when the patch touches a target file only

This keeps the collection layer shared while making diff mode an explicit scope constraint.

### Config-backed file index

Build a resolved config index before collecting findings:

- each concrete source file maps to its bucket and resolved target files
- each concrete target file maps back to its source file and locale

This lets diff parsing stay path-based while the collector still uses the normal config-expanded translation graph.

### Diff parsing

Parse a standard unified git patch from stdin.

- accept configured `.json`, `.jsonc`, and `.arb` files only
- ignore unsupported file types in the patch
- extract changed keys from added and removed object-key lines in hunks
- treat configured files with no identifiable changed keys as no-op scope entries instead of widening to full-file validation

The extraction is intentionally line-based. It follows object nesting well enough for supported key-value files without trying to fully reconstruct arbitrary document edits.

### Diff-mode checks

Keep only key-scoped checks in diff mode:

- `not_localized`
- `same_as_source`
- `whitespace_only`
- `placeholder_mismatch`
- `html_tag_mismatch`
- `icu_shape_mismatch`

Skip these checks in diff mode:

- `missing_target_file`
- `orphaned_key`
- `markdown_ast_mismatch`

## Testing

Add command-level coverage for:

- source-file diff scoping
- target-file diff mapping back to source
- per-file key isolation across multi-file patches
- unsupported file types in diff input
- skipped checks in diff mode
- empty and malformed stdin diffs
- `--diff-stdin` with `--file`
- `--diff-stdin` with `--key`
- unchanged normal `check` behavior through existing tests

# CLI documentation navigation and file formats

## Approved design

Organize the English CLI documentation in reading order: Getting started,
Configuration, File formats, Guides, Integrations, Reference, Troubleshooting,
Release notes, and Contributing. Keep existing page URLs stable. Nest AI providers
and Cloud/TMS connections under Integrations, and group command references by task.

Give every supported translation file format a dedicated page under
`cli/reference/formats`, with an overview and groups for app translations, mobile,
content, interchange, and subtitles. Each page includes extensions, source content,
a file mapping, translation commands, writeback behavior, and known limitations.
Verify claims against the parser and CLI writeback implementation. Distinguish
translation files from terminal output formats.

Simplify the CLI landing page and quickstart around a first successful translation.
Use one complete starter example and link to other provider configurations. Add
next-step links to the format catalog, configuration, and task guides.

## Scope and validation

Update only English CLI content and its navigation in `docs.json`. Preserve Cloud
and localized navigation. Validate navigation targets, MDX, internal links, and
format coverage. Run `mint broken-links` and preview the site when tooling permits.

## Alternatives considered

Reordering existing groups alone leaves gaps in format documentation and the long
quickstart. Separate tabs introduce another navigation layer. Nested groups keep
related reference pages together while preserving one clear reading path.

## Mintlify navigation features

Use group `root` pages for the format overview, providers, TMS integrations,
commands, and release history. Add `directory: "accordion"` to generate child
listings from navigation. Collapse nested format families, providers, command
families, and releases by default. Top-level groups remain visible. These features
follow https://www.mintlify.com/docs/organize/navigation and avoid duplicate manual
catalogs that could drift from the sidebar.

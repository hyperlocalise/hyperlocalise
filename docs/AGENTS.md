# Documentation Agent Instructions

This directory is the Mintlify documentation site for Hyperlocalise.

## Project Context

- Write for Hyperlocalise users and contributors.
- Pages are MDX files with YAML frontmatter.
- Site configuration and navigation live in `docs.json`.
- English source docs live directly under `docs/`.
- Localized docs live under `docs/zh-CN/` and `docs/vi-VN/`.

## Local Workflow

Run Mintlify commands from the `docs` directory:

```bash
mint dev
mint broken-links
```

Use `mint dev` to preview pages locally at `http://localhost:3000`. Use
`mint broken-links` when a change touches navigation, page slugs, or links.

## Writing Style

- Use active voice and second person.
- Prefer short sentences with one idea each.
- Put the user's goal before implementation details.
- Use sentence case for headings.
- Use backticks for commands, paths, filenames, configuration keys, and code.
- Use bold only for visible UI labels, such as **Settings**.
- Keep examples runnable and aligned with the current CLI behavior.

## Content Boundaries

- Edit only the default English docs unless the user asks for localized docs.
- Do not modify files under `docs/zh-CN/` or `docs/vi-VN/` during routine docs
  cleanup or copy changes.
- Keep Mintlify component usage consistent with the surrounding page.
- Update `docs.json` in the same change when you add, remove, rename, or move a
  page.

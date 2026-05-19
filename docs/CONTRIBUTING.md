# Contribute to the Documentation

Thanks for improving the Hyperlocalise docs. These docs explain how to install,
configure, and operate Hyperlocalise, plus how to contribute to the project.

## What to Edit

- Update English docs under `docs/` for routine fixes and new content.
- Update `docs.json` when you add, move, rename, or remove a page.
- Leave `docs/zh-CN/` and `docs/vi-VN/` unchanged unless you are explicitly
  updating localized content.
- Keep product behavior, command flags, and examples aligned with the CLI and
  web app code.

## Local Development

1. Install the Mintlify CLI:

   ```bash
   npm i -g mint
   ```

2. Run the preview server from the `docs` directory:

   ```bash
   mint dev
   ```

3. Open `http://localhost:3000` and review the changed pages.

4. Check links when the change touches navigation or cross-page references:

   ```bash
   mint broken-links
   ```

For broader repository setup, see `contributing/development.mdx`.

## Writing Guidelines

- Use active voice: "Run the command" instead of "The command should be run."
- Address the reader directly with "you."
- Keep sentences concise, with one idea per sentence.
- Lead with the user's goal before explaining details.
- Use consistent terms for the same concept.
- Include examples for commands, configuration, and expected output.
- Use sentence case for headings.
- Format commands, paths, filenames, keys, and code values with backticks.
- Bold UI labels only when referring to visible interface text.

## Pull Requests

Before opening a pull request, preview the docs locally and run the repository
validation requested for your change. Keep documentation-only pull requests
focused on the affected pages and navigation updates.

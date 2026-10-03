# Contribute to the Documentation

Thanks for improving the Hyperlocalise docs. These docs explain Platform and the
CLI, plus how to contribute to the project.

## What to Edit

- Update English Platform docs under `docs/platform/` and `docs/index.mdx`.
- Update English CLI docs under `docs/cli/`.
- Update English docs under `docs/` for shared pages such as contributing.
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

## Help article standard

Use this structure for Platform task guides:

1. State the outcome and when to use the guide.
2. Explain prerequisites, permissions, and decisions before the steps.
3. Follow the screen's field order and exact action labels; identify optional fields and defaults.
4. Explain the expected result and how to verify it.
5. Connect common visible errors to a corrective action.
6. Link to the next task in the workflow.

Use real screenshots from the current product when a control is difficult to find. Include descriptive alt text, remove customer information, and capture the relevant state. Do not publish mockups as product screenshots.

Role guides should link readers through existing task articles rather than repeat those instructions. Keep native and provider-owned behavior explicit. Verify import status, overwrite behavior, and irreversible actions against the implementation before describing them.

When changing a UI label or workflow, include a review of its linked help articles in the change. The feature owner should verify the instructions and screenshots; docs reviewers should check the user journey and links.

## Pull Requests

Before opening a pull request, preview the docs locally and run the repository
validation requested for your change. Keep documentation-only pull requests
focused on the affected pages and navigation updates.
